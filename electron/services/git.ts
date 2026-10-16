import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import type { GitFile, GitStatus, GitCommit, GitBranch } from '../../shared/contracts';
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
          await this.validateBranch(root, value); args = ['switch', value as string]; break;
        case 'merge':
          await this.validateBranch(root, value); args = ['merge', '--no-edit', '--', value as string]; break;
        case 'abort': args = ['merge', '--abort']; break;
        case 'fetch': args = ['fetch', '--prune']; break;
        case 'pull': args = ['pull', '--ff-only']; break;
        case 'push': {
          const status = await this.status(root);
          if (status.branch.includes('(detached)')) throw new Error('当前为游离 HEAD，请先切换到分支再推送');
          if (status.upstream) args = ['push'];
          else { await gitCommand(root, ['remote', 'get-url', 'origin']); args = ['push', '--set-upstream', 'origin', 'HEAD']; }
          break;
        }
        default: throw new Error('不支持的 Git 操作');
      }
      return gitCommand(root, args, ['fetch', 'pull', 'push'].includes(operation), input);
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
