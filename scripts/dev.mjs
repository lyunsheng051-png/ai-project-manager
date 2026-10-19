import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { prepareDesktop } from './desktop-runtime.mjs';

const require = createRequire(import.meta.url);
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
// 仅转换 Electron 主进程。渲染端由 Vite 开发服务器提供，不执行前端 build。
await prepareDesktop();
// 桌面端独立选择空闲端口，不与网页预览的固定端口竞争。
const server = await createServer({ server: { port: 0, strictPort: false, open: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('正在打开桌面客户端…');
const env = { ...process.env, AIPM_RENDERER_URL: url, AIPM_DESKTOP_LAUNCH: '1' };
delete env.ELECTRON_RUN_AS_NODE;
// 正常启动不继承自动化测试的隐藏窗口标志。
delete env.AIPM_QA;
const desktop = spawn(require('electron'), ['.'], { env, stdio: ['inherit', 'inherit', 'inherit', 'ipc'], windowsHide: false });
desktop.on('message', message => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'desktop-ready') console.log('桌面客户端已打开。关闭窗口后会在托盘后台运行，右键托盘图标选择“退出工作台”可结束运行。');
  if (message.type === 'desktop-existing') console.log('已切换到正在运行的桌面客户端。');
  if (process.connected) process.send?.(message);
});
desktop.on('error', async (error) => { console.error(error); await server.close(); process.exit(1); });
desktop.on('exit', async (code) => { await server.close(); process.exit(code ?? 0); });
function quitDesktop() { if (desktop.connected) desktop.send({ type: 'desktop-quit' }); else desktop.kill(); }
process.on('SIGINT', quitDesktop);
process.on('SIGTERM', quitDesktop);
// 测试父进程通过 IPC 关闭临时实例，沿用客户端的进程清理流程。
process.on('message', message => { if (message && typeof message === 'object' && message.type === 'desktop-quit') quitDesktop(); });
