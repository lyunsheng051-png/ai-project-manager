import { fork, execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = await mkdtemp(path.join(tmpdir(), 'aipm-launcher-'));
const execute = promisify(execFile);
// 保持网页预览端口被占用，验证桌面启动不会依赖该端口。
const occupied = createServer(); let ownsPort = false;
await new Promise((resolve, reject) => {
  occupied.once('error', error => error.code === 'EADDRINUSE' ? resolve() : reject(error));
  occupied.listen(5178, '127.0.0.1', () => { ownsPort = true; resolve(); });
});
const launcher = fork(path.join(root, 'scripts/dev.mjs'), [], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  env: { ...process.env, AIPM_USER_DATA: path.join(fixture, 'app-data'), AIPM_QA: '1', ELECTRON_RUN_AS_NODE: '1' },
});
let output = ''; let exited = false; let exitCode;
launcher.stdout.on('data', data => { output += data; });
launcher.stderr.on('data', data => { output += data; });
const exit = new Promise(resolve => launcher.once('exit', code => { exited = true; exitCode = code; resolve(); }));
function deadline(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}
try {
  const ready = await deadline(new Promise((resolve, reject) => {
    launcher.on('message', message => { if (message?.type === 'desktop-ready') resolve(message); });
    launcher.once('error', reject);
    launcher.once('exit', () => reject(new Error(`启动进程提前退出：${output}`)));
  }), 45_000, '未收到桌面窗口显示确认');
  assert.equal(ready.visible, true, 'normal launcher must override inherited QA hidden mode');
  assert.notEqual(new URL(ready.rendererUrl).port, '5178');
  assert.equal((await fetch(ready.rendererUrl)).status, 200);
  if (process.platform === 'win32') {
    const { stdout } = await execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      `$windowHandle = 0; for ($attempt = 0; $attempt -lt 20; $attempt++) { $windowHandle = (Get-Process -Id ${Number(ready.pid)}).MainWindowHandle.ToInt64(); if ($windowHandle -ne 0) { break }; Start-Sleep -Milliseconds 100 }; Write-Output $windowHandle`],
    { windowsHide: true, timeout: 10_000 });
    assert.ok(Number(stdout.trim()) > 0, 'Windows must expose a visible native main window');
  }
  if (ownsPort) assert.equal(occupied.listening, true, 'preview server must remain untouched');
  launcher.send({ type: 'desktop-quit' });
  await deadline(exit, 15_000, '桌面关闭后启动进程未退出');
  assert.equal(exitCode, 0, output);
  assert.equal(await fetch(ready.rendererUrl, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false), false);
  console.log('PASS normal desktop launcher: visible native window, inherited test flags cleared, occupied preview port preserved, clean exit');
} catch (error) {
  console.error(output); throw error;
} finally {
  if (!exited) {
    if (launcher.connected) launcher.send({ type: 'desktop-quit' });
    await deadline(exit, 10_000, '临时测试实例清理超时').catch(async () => {
      if (process.platform === 'win32') await execute('taskkill.exe', ['/PID', String(launcher.pid), '/T', '/F'], { windowsHide: true }).catch(() => undefined);
      else launcher.kill();
    });
  }
  if (ownsPort) await new Promise(resolve => occupied.close(resolve));
}
