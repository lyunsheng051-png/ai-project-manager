import { app, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEME = 'aipm';
const PACKAGED_URL = `${SCHEME}://app/index.html`;

// 注册为标准安全来源，使安装版可正常加载相对路径、异步代码块和字体。
export function registerRendererScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
}

export function rendererUrl() {
  if (app.isPackaged) return PACKAGED_URL;
  const value = process.env.AIPM_RENDERER_URL;
  if (!value) throw new Error('请使用 npm run dev:desktop 启动开发版');
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('开发界面仅允许本机 HTTP 来源');
  return url.href;
}

export function isRendererNavigation(value: string, expected: string) {
  try {
    const target = new URL(value); const source = new URL(expected);
    if (source.protocol === `${SCHEME}:`) return target.protocol === source.protocol && target.host === source.host
      && !target.username && !target.password;
    return target.origin === source.origin;
  } catch { return false; }
}

export function servePackagedRenderer() {
  if (!app.isPackaged) return;
  const root = path.join(app.getAppPath(), 'renderer');
  protocol.handle(SCHEME, async request => {
    if (!isRendererNavigation(request.url, PACKAGED_URL)) return new Response('Forbidden', { status: 403 });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    try {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Forbidden', { status: 403 });
      return await net.fetch(pathToFileURL(target).href, { method: request.method });
    } catch { return new Response('Not found', { status: 404 }); }
  });
}
