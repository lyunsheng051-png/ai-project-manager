import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GitFile, GitStatus, GitCommit, GitBranch, GitConflictData } from '../../shared/contracts';
import { ProjectQueue } from '../core/queue';
import { validateRemote } from '../core/paths';

export function gitCommand(directory: string, args: string[], network = false, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', ['-c', 'core.quotepath=false', '-C', directory, ...args], {
      encoding: 'utf8', windowsHide: true, timeout: network ? 120_000 : 30_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'auto' },
    }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).trim()));
      else resolve(stdout || stderr || '');
    });
    if (input !== undefined) {
      child.stdin?.on('error', () => { /* Git 提前退出时，由上面的回调报告实际错误 */ });
      child.stdin?.end(input, 'utf8');
    }
  });
}

function gitMergeFile(directory: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.quotepath=false', '-C', directory, ...args], {
      encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'auto' },
    }, (error, stdout, stderr) => {
      // git merge-file returns 1 when it found conflicts, but stdout is still
      // the useful conflict-marked merge result.
      if (!error || Number(error.code) === 1) resolve(stdout || '');
      else reject(new Error(String(stderr || error.message).trim()));
    });
  });
}

async function buildMergePreview(root: string, base: string, current: string, remote: string) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ai-project-merge-'));
  const baseFile = path.join(directory, 'base');
  const currentFile = path.join(directory, 'current');
  const remoteFile = path.join(directory, 'remote');
  try {
    await Promise.all([
      writeFile(baseFile, base, 'utf8'),
      writeFile(currentFile, current, 'utf8'),
      writeFile(remoteFile, remote, 'utf8'),
    ]);
    const merged = await gitMergeFile(root, ['merge-file', '--stdout', '-L', '当前本地', '-L', '共同祖先', '-L', '远端', currentFile, baseFile, remoteFile]);
    return /^<<<<<<<[^\r\n]*(?:\r\n|\n|\r)/m.test(merged) ? merged : '';
  } catch {
    return '';
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function parseStatus(output: string): GitFile[] {
  const records = output.split('\0');
  const files: GitFile[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record || record.length < 4) continue;
    const index = record[0]; const working = record[1];
    const file: GitFile = { path: record.slice(3), index, working,
      staged: index !== ' ' && index !== '?' && index !== '!',
      unstaged: working !== ' ' || index === '?',
      conflict: ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(index + working) };
    if ([index, working].some(s => s === 'R' || s === 'C')) file.originalPath = records[++i];
    files.push(file);
  }
  return files;
}

export class GitService {
  private queue = new ProjectQueue();
  async status(root: string): Promise<GitStatus> {
    const empty: GitStatus = { isRepository: false, branch: '', upstream: '', ahead: 0, behind: 0, files: [], merging: false };
    try { await gitCommand(root, ['rev-parse', '--is-inside-work-tree']); } catch { return empty; }
    const branch = (await gitCommand(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(async () =>
      (await gitCommand(root, ['rev-parse', '--short', 'HEAD']).catch(() => 'HEAD')) + ' (detached)')).trim();
    const upstream = (await gitCommand(root, ['rev-parse', '--abbrev-ref', '@{upstream}']).catch(() => '')).trim();
    let ahead = 0; let behind = 0;
    if (upstream) {
      const counts = (await gitCommand(root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']).catch(() => '0 0')).trim().split(/\s+/);
      ahead = Number(counts[0]) || 0; behind = Number(counts[1]) || 0;
    }
    const files = parseStatus(await gitCommand(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
    const mergePath = (await gitCommand(root, ['rev-parse', '--git-path', 'MERGE_HEAD'])).trim();
    const merging = await access(path.resolve(root, mergePath)).then(() => true, () => false);
    return { isRepository: true, branch, upstream, ahead, behind, files, merging };
  }
  async history(root: string): Promise<GitCommit[]> {
    const output = await gitCommand(root, ['log', '-100', '--format=%H%x00%h%x00%an%x00%aI%x00%s%x1e']).catch(async error => {
      const status = await this.status(root);
      if (status.isRepository && !status.upstream && /does not have any commits|unknown revision|bad default revision/i.test(error.message)) return '';
      throw error;
    });
    return output.split('\x1e').map(r => r.trim()).filter(Boolean).map(row => {
      const [hash, shortHash, author, date, subject] = row.split('\0');
      return { hash, shortHash, author, date, subject };
    });
  }
  async branches(root: string): Promise<GitBranch[]> {
    const output = await gitCommand(root, ['for-each-ref', '--format=%(refname:short)%00%(objectname:short)%00%(HEAD)', 'refs/heads/']);
    return output.trim().split('\n').filter(Boolean).map(row => {
      const [name, hash, current] = row.split('\0'); return { name, hash, current: current?.trim() === '*' };
    });
  }
  async diff(root: string, file: string, staged: boolean): Promise<string> {
    return gitCommand(root, ['diff', ...(staged ? ['--cached'] : []), '--no-ext-diff', '--no-textconv', '--', file]);
  }
  async conflict(root: string, file: string, result: string): Promise<GitConflictData> {
    // Git 的索引阶段对象必须使用 `:<stage>:<path>` 语法：
    // 1 是共同祖先，2 是当前本地版本，3 是远端版本。
    // 缺少最前面的冒号会被 Git 解析成名为 "2"/"3" 的对象，导致两侧内容被误读为空。
    const readStage = (stage: 1 | 2 | 3) => gitCommand(root, ['show', ':' + stage + ':' + file]).catch(() => '');
    const [base, current, remote] = await Promise.all([readStage(1), readStage(2), readStage(3)]);
    const mergePreview = /^<<<<<<<[^\r\n]*(?:\r\n|\n|\r)/m.test(result) ? '' : await buildMergePreview(root, base, current, remote);
    return { path: file, base, current, remote, result, ...(mergePreview ? { mergePreview } : {}) };
  }
  mutate(root: string, operation: string, value?: string | string[]): Promise<string> {
    return this.queue.run(root, async () => {
      const paths = Array.isArray(value) ? value : [];
      let args: string[];
      let input: string | undefined;
      switch (operation) {
        case 'stage':
          if (!paths.length) throw new Error('请选择要暂存的文件');
          args = ['--literal-pathspecs', 'add', '--pathspec-from-file=-', '--pathspec-file-nul'];
          input = paths.join('\0') + '\0'; break;
        case 'unstage':
          if (!paths.length) throw new Error('请选择要取消暂存的文件');
          const hasHead = await gitCommand(root, ['rev-parse', '--verify', 'HEAD']).then(() => true, () => false);
          args = ['--literal-pathspecs', ...(hasHead ? ['restore', '--staged'] : ['rm', '--cached']), '--pathspec-from-file=-', '--pathspec-file-nul'];
          input = paths.join('\0') + '\0'; break;
        case 'commit':
          if (typeof value !== 'string' || !value.trim()) throw new Error('请填写提交说明');
          args = ['commit', '-m', value]; break;
        case 'create-branch':
          await this.validateBranch(root, value); args = ['switch', '-c', value as string]; break;
        case 'switch':
          await this.validateBranch(root, value);
          await gitCommand(root, ['show-ref', '--verify', '--quiet', `refs/heads/${value as string}`]);
          args = ['switch', '--no-guess', value as string]; break;
        case 'merge':
          await this.validateBranch(root, value); args = ['merge', '--no-edit', '--', value as string]; break;
        case 'abort': args = ['merge', '--abort']; break;
        case 'fetch': args = ['fetch', '--prune']; break;
        case 'pull': args = ['pull', '--ff-only']; break;
        case 'merge-remote': {
          const status = await this.status(root);
          if (status.merging) throw new Error('当前已有未完成的合并，请先处理冲突并提交，或中止合并');
          if (!status.upstream) throw new Error('当前分支没有配置远端上游，请先推送一次或在终端配置上游分支');
          await gitCommand(root, ['fetch', '--prune'], true);
          const upstream = (await gitCommand(root, ['rev-parse', '--abbrev-ref', '@{upstream}'])).trim();
          if (!upstream) throw new Error('无法确定当前分支对应的远端分支');
          args = ['merge', '--no-edit', '--', upstream]; break;
        }
        case 'push': {
          const status = await this.status(root);
          if (status.branch.includes('(detached)')) throw new Error('当前为游离 HEAD，请先切换到分支再推送');
          if (status.upstream) args = ['push'];
          else { await gitCommand(root, ['remote', 'get-url', 'origin']); args = ['push', '--set-upstream', 'origin', 'HEAD']; }
          break;
        }
        default: throw new Error('不支持的 Git 操作');
      }
      try {
        return await gitCommand(root, args, ['fetch', 'pull', 'push'].includes(operation), input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (operation === 'push' && /non-fast-forward|fetch first|rejected|remote rejected|failed to push/i.test(message)) {
          throw new Error('远端有新的提交，推送被拒绝。请先点击“合并远端”，处理冲突并提交合并后，再重新推送。');
        }
        if (operation === 'pull' && /not possible to fast-forward|divergent branches|would be overwritten|local changes/i.test(message)) {
          throw new Error('本地与远端无法直接快进。请先保存或提交本地修改，再点击“合并远端”；如出现冲突，请在文件浏览中处理后提交合并。');
        }
        if (operation === 'merge-remote' && /CONFLICT|Automatic merge failed|merge conflict/i.test(message)) {
          throw new Error('远端已获取，但合并产生了文件冲突。请在文件浏览中处理带冲突标记的文件，保存后回到 Git 变更暂存并提交合并。');
        }
        if (operation === 'commit' && /unmerged|cannot commit|resolve your current index first|would be overwritten/i.test(message)) {
          throw new Error('还有冲突文件未解决，请在文件浏览中处理冲突标记，保存并暂存所有冲突文件后再提交合并。');
        }
        throw error;
      }
    });
  }
  private async validateBranch(root: string, name: unknown) {
    if (typeof name !== 'string' || !name.trim() || name.startsWith('-')) throw new Error('分支名称无效');
    await gitCommand(root, ['check-ref-format', '--branch', name]);
  }
  async clone(parent: string, url: string, target: string): Promise<void> {
    await gitCommand(parent, ['-c', 'protocol.ext.allow=never', '-c', 'protocol.file.allow=never', 'clone', '--', validateRemote(url), target], true);
  }
}
