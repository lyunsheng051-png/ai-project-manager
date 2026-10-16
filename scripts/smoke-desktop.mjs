import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:net';
import { prepareDesktop } from './desktop-runtime.mjs';
import { verifyDockResize, verifyTerminalResize } from './desktop-checks/dock-resize.mjs';
import { verifyGitFiles } from './desktop-checks/git-files.mjs';
import { verifyWorkspaceLayout } from './desktop-checks/workspace-layout.mjs';
import { verifyFileEditor } from './desktop-checks/file-editor.mjs';

const require = createRequire(import.meta.url);
const fixture = await mkdtemp(path.join(tmpdir(), 'aipm-desktop-'));
const repo = path.join(fixture, 'example-project');
await mkdir(repo); await mkdir('.runtime/screenshots', { recursive: true });
const freePort = () => new Promise((resolve, reject) => { const server = createHttpServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const apiPort = await freePort(); const webPort = await freePort();
for (const [folder, port, frontend] of [['api', apiPort, false], ['web', webPort, true]]) {
  await mkdir(path.join(repo, folder));
  await writeFile(path.join(repo, folder, 'package.json'), JSON.stringify({ name: frontend ? '演示前端' : '演示后端', scripts: { start: 'node server.cjs' }, ...(frontend ? { dependencies: { vue: '*' } } : {}) }));
  await writeFile(path.join(repo, folder, 'server.cjs'), `require('http').createServer((req,res)=>res.end('ready')).listen(${port},'127.0.0.1',()=>console.log('SERVICE_READY_${port}'));`);
}
await writeFile(path.join(repo, 'README.md'), '# 示例项目\n\n用于桌面验证的临时仓库。\n');
execFileSync('git', ['init', '-b', 'main', repo], { windowsHide: true });
for (const args of [['config', 'user.name', 'AIPM QA'], ['config', 'user.email', 'qa@example.invalid'], ['add', '.'], ['commit', '-m', 'initial']]) execFileSync('git', ['-C', repo, ...args], { windowsHide: true });
await prepareDesktop();
const vite = await createServer(); await vite.listen();
const env = { ...process.env, AIPM_RENDERER_URL: vite.resolvedUrls.local[0], AIPM_USER_DATA: path.join(fixture, 'app-data'), AIPM_QA: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let application;
const failures = [];
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], env, timeout: 45_000 });
  application.process().stderr.on('data', data => process.stderr.write(data));
  const page = await application.firstWindow();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => failures.push(error.message));
  await page.getByRole('heading', { name: '让项目，随时就绪。' }).waitFor();
  await page.screenshot({ path: '.runtime/screenshots/empty.png' });
  console.log('PASS empty workspace');
  const call = (action, payload) => page.evaluate(({ action, payload }) => window.desktop.request(action, payload), { action, payload });
  const project = await call('project:import', { path: repo }); assert.equal(project.services.length, 2);
  await call('project:activate', { projectId: project.id });
  await page.getByRole('heading', { name: 'example-project', exact: true }).waitFor();
  console.log('PASS project import and scan');
  await verifyDockResize(page, application);
  for (const service of project.services) {
    service.url = `http://127.0.0.1:${service.directory === 'api' ? apiPort : webPort}`;
    if (service.directory === 'web') service.dependsOn = [project.services.find(s => s.directory === 'api').id];
    await call('service:save', { projectId: project.id, profile: service });
  }
  // 真实界面打开配置，验证响应式对象可正确编辑。
  await page.getByRole('button', { name: '编辑运行配置', exact: true }).first().click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  console.log('PASS edit service configuration');
  await page.getByRole('button', { name: '组合启动', exact: true }).click();
  await page.getByText('已就绪', { exact: true }).nth(1).waitFor({ timeout: 45_000 });
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${webPort}`)).status, 200);
  await page.screenshot({ path: '.runtime/screenshots/services.png' });
  console.log('PASS dependency startup and HTTP readiness');
  await page.getByRole('button', { name: '停止全部', exact: true }).click();
  await page.getByText('已停止', { exact: true }).nth(1).waitFor({ timeout: 15_000 });
  for (const port of [apiPort, webPort]) {
    const responds = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
    assert.equal(responds, false, `service ${port} must stop with its child process`);
  }
  console.log('PASS stop process trees');
  const occupied = createHttpServer();
  await new Promise((resolve, reject) => { occupied.once('error', reject); occupied.listen(apiPort, '127.0.0.1', resolve); });
  try {
    await assert.rejects(call('service:start', { projectId: project.id, serviceId: project.services.find(s => s.directory === 'api').id }), /已有服务监听/);
    assert.equal(occupied.listening, true, 'occupied port must not cause termination of an external process');
  } finally { await new Promise(resolve => occupied.close(resolve)); }
  const concurrent = await Promise.allSettled([
    call('service:start', { projectId: project.id, serviceId: project.services.find(s => s.directory === 'api').id }),
    call('service:stop-all', { projectId: project.id }),
  ]);
  assert.equal(concurrent[1].status, 'fulfilled');
  assert.equal((await call('bootstrap')).runs.some(r => ['starting', 'running', 'ready', 'stopping'].includes(r.state)), false);
  assert.equal(await fetch(`http://127.0.0.1:${apiPort}`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false), false);
  console.log('PASS occupied port protection and concurrent start cancellation');
  // 终端输入经由真实 PTY，再从事件缓冲检查回显。
  await page.getByRole('region', { name: '输出与终端', exact: true }).getByRole('button', { name: '新建项目终端', exact: true }).click();
  await page.locator('.terminal-canvas').waitFor({ state: 'visible' });
  await verifyTerminalResize(page);
  const terminalId = await page.evaluate(async () => {
    const events = []; window.__qaEvents = events;
    window.desktop.subscribe(event => events.push(event));
    const current = await window.desktop.request('terminal:create', { projectId: (await window.desktop.request('bootstrap')).projects[0].id });
    return current.id;
  });
  const terminalCommand = process.platform === 'win32' ? 'echo AIPM_PTY_OK' : 'printf "AIPM_PTY_OK\\n"';
  await call('terminal:write', { id: terminalId, data: `${terminalCommand}\r` });
  // 必须收到独立的命令执行结果，仅有输入回显不能算终端执行成功。
  await page.waitForFunction(id => {
    const output = window.__qaEvents.filter(e => e.type === 'terminal-data' && e.id === id).map(e => e.data).join('').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
    return /(?:\r?\n)AIPM_PTY_OK\r?\n/.test(output);
  }, terminalId, { timeout: 15_000 });
  await call('terminal:resize', { id: terminalId, cols: 100, rows: 20 });
  await call('terminal:close', { id: terminalId });
  console.log('PASS PTY input, resize and exit');
  await writeFile(path.join(repo, 'README.md'), '# 示例项目\n\n已修改内容。\n');
  await verifyGitFiles(page, repo, call, project.id);
  await verifyWorkspaceLayout(page, application);
  await page.getByLabel('提交说明', { exact: false }).fill('test: desktop flow');
  await page.getByRole('button', { name: '提交已暂存修改', exact: true }).click();
  await page.getByText('工作区干净', { exact: true }).waitFor();
  const commits = await call('git:history', { projectId: project.id }); assert.equal(commits[0].subject, 'test: desktop flow');
  await page.getByRole('button', { name: '分支管理', exact: true }).click();
  await page.getByPlaceholder('新分支名称，例如 feat/project-scan').fill('feat/desktop-test');
  await page.getByRole('button', { name: '创建并切换', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal((await call('git:status', { projectId: project.id })).branch, 'feat/desktop-test');
  console.log('PASS Git stage, commit and branch');
  await page.screenshot({ path: '.runtime/screenshots/git.png' });
  await page.getByRole('button', { name: '文件浏览', exact: true }).click();
  await page.getByRole('button', { name: /README.md/ }).click();
  await page.getByText('已修改内容。', { exact: false }).waitFor();
  await page.screenshot({ path: '.runtime/screenshots/files.png' });
  await verifyFileEditor(page, repo, call, project.id);
  await assert.rejects(call('files:read', { projectId: project.id, path: '../outside.txt' }));
  const metrics = await call('metrics'); assert.ok(metrics.workingSetMb > 0);
  assert.deepEqual(failures, [], 'renderer errors');
  console.log(JSON.stringify({ result: 'passed', fixture, checks: ['import', 'scan', 'edit-config', 'start-dependencies', 'http-ready', 'stop-child-processes', 'occupied-port', 'start-cancellation', 'pty-input', 'pty-resize', 'git-stage', 'git-commit', 'git-branch', 'file-preview', 'path-boundary', 'metrics'], metrics }));
} catch (error) {
  if (application) {
    const page = application.windows()[0];
    if (page && !page.isClosed()) {
      await page.screenshot({ path: '.runtime/screenshots/failure.png' }).catch(() => undefined);
      console.error('UI feedback:', await page.locator('.toast').allTextContents().catch(() => []));
      console.error('Service diagnostics:', await page.evaluate(async () => {
        const state = await window.desktop.request('bootstrap');
        return { runs: state.runs, logs: await Promise.all(state.projects.flatMap(p => p.services.map(async s => ({ name: s.name, output: await window.desktop.request('service:output', { projectId: p.id, serviceId: s.id }) })))) };
      }).catch(() => null));
      console.error('Renderer errors:', failures);
    }
  }
  throw error;
} finally {
  if (application) {
    await application.close().catch(() => undefined);
  }
  await vite.close();
}
