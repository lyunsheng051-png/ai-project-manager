import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GitService, gitCommand, parseStatus } from '../electron/services/git';
import { ProjectQueue } from '../electron/core/queue';
const git = new GitService();
async function repo() {
  const root = await mkdtemp(path.join(tmpdir(), 'aipm-git-'));
  await gitCommand(root, ['init', '-b', 'main']);
  await gitCommand(root, ['config', 'user.name', 'AIPM Test']); await gitCommand(root, ['config', 'user.email', 'test@example.invalid']);
  return root;
}
test('解析含空格、中文、换行和重命名的Git状态', () => {
  const files = parseStatus(' M 中文 file.txt\0R  new name.txt\0old name.txt\0?? line\nbreak.txt\0');
  assert.equal(files.length, 3); assert.equal(files[0].path, '中文 file.txt');
  assert.equal(files[1].originalPath, 'old name.txt'); assert.equal(files[2].path, 'line\nbreak.txt');
});
test('新仓库取消暂存保留文件，真实提交后工作区干净', async () => {
  const root = await repo(); await writeFile(path.join(root, '中文 file.txt'), 'first\n');
  await git.mutate(root, 'stage', ['中文 file.txt']); assert.equal((await git.status(root)).files[0].staged, true);
  await git.mutate(root, 'unstage', ['中文 file.txt']); assert.equal((await git.status(root)).files[0].index, '?');
  await git.mutate(root, 'stage', ['中文 file.txt']); await git.mutate(root, 'commit', '初始提交\n\n保留多行说明');
  assert.equal((await git.status(root)).files.length, 0); assert.equal((await git.history(root))[0].subject, '初始提交');
});
test('暂存/工作区差异分离，提交只包含已暂存内容', async () => {
  const root = await repo(); await writeFile(path.join(root, 'file.txt'), 'initial\n');
  await git.mutate(root, 'stage', ['file.txt']); await git.mutate(root, 'commit', 'initial');
  await writeFile(path.join(root, 'file.txt'), 'staged\n'); await git.mutate(root, 'stage', ['file.txt']);
  await writeFile(path.join(root, 'file.txt'), 'working\n');
  const status = await git.status(root); assert.equal(status.files[0].staged, true); assert.equal(status.files[0].unstaged, true);
  assert.match(await git.diff(root, 'file.txt', true), /\+staged/); assert.match(await git.diff(root, 'file.txt', false), /\+working/);
  await git.mutate(root, 'commit', 'only staged');
  assert.match(await gitCommand(root, ['show', 'HEAD:file.txt']), /staged/);
});
test('真实切分支、合并产生冲突并中止，原修改可继续检查', async () => {
  const root = await repo(); await writeFile(path.join(root, 'file.txt'), 'initial\n'); await git.mutate(root, 'stage', ['file.txt']); await git.mutate(root, 'commit', 'initial');
  await git.mutate(root, 'create-branch', 'feature/test'); await writeFile(path.join(root, 'file.txt'), 'feature\n');
  await git.mutate(root, 'stage', ['file.txt']); await git.mutate(root, 'commit', 'feature'); await git.mutate(root, 'switch', 'main');
  await writeFile(path.join(root, 'file.txt'), 'main\n'); await git.mutate(root, 'stage', ['file.txt']); await git.mutate(root, 'commit', 'main');
  await assert.rejects(git.mutate(root, 'merge', 'feature/test'));
  const status = await git.status(root); assert.equal(status.merging, true); assert.equal(status.files[0].conflict, true);
  await git.mutate(root, 'abort'); assert.equal((await git.status(root)).merging, false);
  assert.equal((await git.branches(root)).find(b => b.name === 'main')?.current, true);
});
test('分支参数无法注入命令选项', async () => { const root = await repo(); await assert.rejects(git.mutate(root, 'create-branch', '--detach'), /分支名称无效/); });
test('空仓库历史返回空列表', async () => { const root = await repo(); assert.deepEqual(await git.history(root), []); });

test('新目录逐项展示深层文件，保留忽略规则并支持仅暂存指定文件', async () => {
  const root = await repo(); await writeFile(path.join(root, '.gitignore'), 'node_modules/\nsrc/generated/\n.env\n');
  await git.mutate(root, 'stage', ['.gitignore']); await git.mutate(root, 'commit', 'ignore generated files');
  const names = ['src/components/[entry].ts', 'src/components/e.ts', 'src/views/deep/中文 文件.ts',
    ...Array.from({ length: 25 }, (_, index) => `src/features/group-${index}/index.ts`)];
  for (const name of [...names, 'node_modules/pkg/index.js', 'src/generated/ignored.ts', '.env']) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), 'export const value = 1;\n');
  }
  const status = await git.status(root);
  assert.deepEqual(status.files.map(f => f.path).sort(), [...names].sort());
  assert.equal(status.files.some(f => f.path.endsWith('/')), false);
  await git.mutate(root, 'stage', [names[0]]);
  assert.deepEqual((await git.status(root)).files.filter(f => f.staged).map(f => f.path), [names[0]]);
  await git.mutate(root, 'unstage', [names[0]]);
  assert.equal((await git.status(root)).files.every(f => !f.staged), true);
});

test('大量文件批量暂存与取消暂存不受 Windows 命令行长度限制', async () => {
  const root = await repo();
  const directory = 'src/batch/long_directory_name_for_bulk_pathspec_compatibility';
  await mkdir(path.join(root, directory), { recursive: true });
  const names = Array.from({ length: 620 }, (_, index) => `${directory}/feature_component_with_long_name_${index}.ts`);
  await Promise.all(names.map(name => writeFile(path.join(root, name), 'export {};\n')));
  assert.ok(names.join(' ').length > 32_768);
  await git.mutate(root, 'stage', names);
  let status = await git.status(root); assert.equal(status.files.length, names.length); assert.equal(status.files.every(f => f.staged), true);
  await git.mutate(root, 'unstage', names);
  status = await git.status(root); assert.equal(status.files.length, names.length); assert.equal(status.files.every(f => !f.staged), true);
});
test('已暂存重命名可继续暂存内容并取消整个重命名', async () => {
  const root = await repo(); await writeFile(path.join(root, 'old name.txt'), 'original\n');
  await git.mutate(root, 'stage', ['old name.txt']); await git.mutate(root, 'commit', 'initial');
  await rename(path.join(root, 'old name.txt'), path.join(root, 'new 中文.txt'));
  await git.mutate(root, 'stage', ['old name.txt', 'new 中文.txt']);
  await writeFile(path.join(root, 'new 中文.txt'), 'original\nchanged\n');
  await git.mutate(root, 'stage', ['new 中文.txt']);
  await git.mutate(root, 'unstage', ['new 中文.txt', 'old name.txt']);
  assert.equal((await git.status(root)).files.every(f => !f.staged), true);
});
test('同仓库Git写操作顺序执行，失败不会阻塞后续任务', async () => {
  const queue = new ProjectQueue(); const events: string[] = [];
  const first = queue.run('repo', async () => { events.push('first'); throw new Error('expected'); });
  const second = queue.run('repo', async () => { events.push('second'); return 2; });
  await assert.rejects(first); assert.equal(await second, 2); assert.deepEqual(events, ['first', 'second']);
});

test('本地裸仓库验证首次推送、Fetch、快进拉取及分叉保护', async () => {
  const root = await repo(); const remote = await mkdtemp(path.join(tmpdir(), 'aipm-remote-'));
  await gitCommand(remote, ['init', '--bare', '-b', 'main']);
  await gitCommand(root, ['remote', 'add', 'origin', remote]);
  await writeFile(path.join(root, 'first.txt'), 'initial\n');
  await git.mutate(root, 'stage', ['first.txt']); await git.mutate(root, 'commit', 'initial');
  await git.mutate(root, 'push');
  assert.equal((await git.status(root)).upstream, 'origin/main');
  const peer = path.join(await mkdtemp(path.join(tmpdir(), 'aipm-peer-')), 'work'); await mkdir(peer);
  await gitCommand(peer, ['clone', remote, '.']);
  await gitCommand(peer, ['config', 'user.name', 'Peer Test']); await gitCommand(peer, ['config', 'user.email', 'peer@example.invalid']);
  await writeFile(path.join(peer, 'peer.txt'), 'from peer\n');
  await git.mutate(peer, 'stage', ['peer.txt']); await git.mutate(peer, 'commit', 'peer update'); await git.mutate(peer, 'push');
  await git.mutate(root, 'fetch'); assert.equal((await git.status(root)).behind, 1);
  await git.mutate(root, 'pull'); assert.equal((await git.status(root)).behind, 0);
  assert.equal((await git.history(root))[0].subject, 'peer update');
  await writeFile(path.join(root, 'local.txt'), 'local\n'); await git.mutate(root, 'stage', ['local.txt']); await git.mutate(root, 'commit', 'local divergence');
  const localHead = (await git.history(root))[0].hash;
  await writeFile(path.join(peer, 'remote.txt'), 'remote\n'); await git.mutate(peer, 'stage', ['remote.txt']); await git.mutate(peer, 'commit', 'remote divergence'); await git.mutate(peer, 'push');
  await assert.rejects(git.mutate(root, 'pull'));
  const status = await git.status(root); assert.equal(status.ahead, 1); assert.equal(status.behind, 1); assert.equal(status.merging, false);
  assert.equal((await git.history(root))[0].hash, localHead);
  await assert.rejects(git.mutate(root, 'push'));
});
