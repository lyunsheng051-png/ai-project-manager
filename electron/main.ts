import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { z } from 'zod';
import { ProjectStore } from './repositories/project-store';
import { ThemeStore } from './repositories/theme-store';
import { checkFileCopy, copyFileEntries } from './services/file-copy';
import { readFileClipboard, writeFileClipboard } from './services/file-clipboard';
import { trashProjectEntry } from './services/file-delete';
import { scanProject, mergeScannedServices } from './services/scanner';
import { GitService } from './services/git';
import { ProcessService, orderServices } from './services/processes';
import { listFiles, readTextFile, saveTextFile, readImageFile, createFileEntry } from './services/files';
import { validateCloneName, withinProject } from './core/paths';
import type { DesktopEvent, ServiceProfile } from '../shared/contracts';

if (process.env.AIPM_USER_DATA) app.setPath('userData', path.resolve(process.env.AIPM_USER_DATA));
app.setName('项目工作台');
nativeTheme.themeSource = 'dark';
const locked = app.requestSingleInstanceLock();
function reportLaunch(type: 'desktop-ready' | 'desktop-existing', extra: Record<string, unknown> = {}) {
  if (process.env.AIPM_DESKTOP_LAUNCH === '1' && process.connected) process.send?.({ type, ...extra });
}
if (!locked) { reportLaunch('desktop-existing'); app.quit(); }
if (process.env.AIPM_DESKTOP_LAUNCH === '1') {
  process.on('message', message => {
    if (message && typeof message === 'object' && 'type' in message && message.type === 'desktop-quit') app.quit();
  });
}

let window: BrowserWindow | null = null;
let store: ProjectStore;
let appearance: ThemeStore;
function titleBarColors() {
  const light = appearance.get() === 'light';
  return { color: light ? '#edf3fa' : '#142135', symbolColor: light ? '#24364e' : '#dce6f3', height: 32 };
}
function applyNativeTheme() {
  const theme = appearance.get();
  nativeTheme.themeSource = theme;
  window?.setBackgroundColor(theme === 'light' ? '#edf3fa' : '#0b1220');
  if (process.platform === 'win32') window?.setTitleBarOverlay(titleBarColors());
}
const git = new GitService();
const emit = (event: DesktopEvent) => { if (window && !window.isDestroyed()) window.webContents.send('pm:event', event); };
const processes = new ProcessService(emit);
let quitting = false;
const pid = z.object({ projectId: z.string().min(1).max(100) });
const file = pid.extend({ path: z.string().max(4096) });
const copyRequest = file.extend({ sources: z.array(z.union([
  z.object({ projectId: z.string().min(1).max(100), path: z.string().min(1).max(4096) }),
  z.object({ externalPath: z.string().min(1).max(4096) }),
])).min(1).max(200) });
async function copySources(sources: z.infer<typeof copyRequest>['sources']) {
  return Promise.all(sources.map(source => 'externalPath' in source ? source.externalPath : withinProject(store.get(source.projectId).path, source.path)));
}
const serviceId = pid.extend({ serviceId: z.string().min(1).max(100) });
const serviceSchema = z.object({
  id: z.string().max(100), name: z.string().trim().min(1).max(100),
  kind: z.enum(['frontend', 'backend', 'java', 'task']), directory: z.string().max(4096),
  command: z.string().max(8192), url: z.string().max(2048),
  environment: z.record(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/), z.string().max(8192)),
  dependsOn: z.array(z.string().max(100)).max(50), evidence: z.string().max(500),
});
function publishProjects() { emit({ type: 'projects', projects: store.list() }); }
type Handler = (payload: unknown) => unknown | Promise<unknown>;
const handlers: Record<string, Handler> = {
  'theme:get': () => appearance.get(),
  'layout:sidebar:get': () => appearance.getSidebarCollapsed(),
  'layout:sidebar:set': payload => appearance.saveSidebarCollapsed(z.object({ collapsed: z.boolean() }).parse(payload).collapsed),
  'theme:set': async payload => {
    const { theme } = z.object({ theme: z.enum(['dark', 'light']) }).parse(payload);
    await appearance.save(theme); applyNativeTheme(); return theme;
  },
  bootstrap: () => ({ projects: store.list(), runs: processes.runs(), version: app.getVersion(), platform: process.platform }),
  'project:import': async payload => {
    const input = z.object({ path: z.string().max(4096).optional() }).parse(payload);
    let directory = input.path;
    if (!directory) {
      const result = await dialog.showOpenDialog(window!, { title: '导入本地项目', properties: ['openDirectory'] });
      if (result.canceled) return null; directory = result.filePaths[0];
    }
    const services = await scanProject(directory);
    const project = await store.add(directory, services); publishProjects(); return project;
  },
  'project:clone': async payload => {
    const { url, name } = z.object({ url: z.string().max(2048), name: z.string().max(150) }).parse(payload);
    const safeName = validateCloneName(name);
    const result = await dialog.showOpenDialog(window!, { title: '选择存放仓库的父文件夹', properties: ['openDirectory'] });
    if (result.canceled) return null;
    const target = path.join(result.filePaths[0], safeName);
    if (await access(target).then(() => true, () => false)) throw new Error('目标文件夹已存在，请使用其他名称或导入本地项目');
    await git.clone(result.filePaths[0], url, target);
    const project = await store.add(target, await scanProject(target)); publishProjects(); return project;
  },
  'project:activate': async payload => { const project = await store.activate(pid.parse(payload).projectId); publishProjects(); return project; },
  'project:favorite': async payload => { const project = await store.favorite(pid.parse(payload).projectId); publishProjects(); return project; },
  'project:remove': async payload => {
    const { projectId } = pid.parse(payload); store.get(projectId);
    await processes.removeProject(projectId); await store.remove(projectId); publishProjects();
  },
  'project:scan': async payload => {
    const project = store.get(pid.parse(payload).projectId);
    const next = await store.services(project.id, mergeScannedServices(project.services, await scanProject(project.path)));
    publishProjects(); return next;
  },
  'service:save': async payload => {
    const input = pid.extend({ profile: serviceSchema }).parse(payload);
    const project = store.get(input.projectId);
    const profile: ServiceProfile = { ...input.profile, id: input.profile.id || randomUUID() };
    await withinProject(project.path, profile.directory, true);
    if (processes.runs().some(r => r.projectId === project.id && r.serviceId === profile.id && ['starting', 'running', 'ready', 'stopping'].includes(r.state))) {
      throw new Error('请先停止服务，再修改运行配置');
    }
    if (profile.url && !['http:', 'https:'].includes(new URL(profile.url).protocol)) throw new Error('就绪地址仅支持 HTTP / HTTPS');
    const exists = project.services.some(s => s.id === profile.id);
    const services = exists ? project.services.map(s => s.id === profile.id ? profile : s) : [...project.services, profile];
    orderServices(services);
    const next = await store.services(project.id, services); publishProjects(); return next;
  },
  'service:delete': async payload => {
    const { projectId, serviceId: id } = serviceId.parse(payload); const project = store.get(projectId);
    if (project.services.some(s => s.dependsOn.includes(id))) throw new Error('其他服务依赖此配置，请先移除依赖');
    await processes.forgetService(projectId, id);
    const next = await store.services(projectId, project.services.filter(s => s.id !== id)); publishProjects(); return next;
  },
  'service:start': payload => { const v = serviceId.parse(payload); return processes.start(store.get(v.projectId), v.serviceId); },
  'service:stop': payload => { const v = serviceId.parse(payload); store.get(v.projectId); return processes.stop(v.projectId, v.serviceId); },
  'service:start-all': payload => processes.startAll(store.get(pid.parse(payload).projectId)),
  'service:stop-all': payload => { const v = pid.parse(payload); store.get(v.projectId); return processes.stopAll(v.projectId); },
  'service:output': payload => { const v = serviceId.parse(payload); store.get(v.projectId); return processes.output(v.projectId, v.serviceId); },
  'terminal:create': payload => processes.createTerminal(store.get(pid.parse(payload).projectId)),
  'terminal:write': payload => { const v = z.object({ id: z.string().max(100), data: z.string().max(100_000) }).parse(payload); processes.terminalWrite(v.id, v.data); },
  'terminal:resize': payload => { const v = z.object({ id: z.string().max(100), cols: z.number().int().min(2).max(500), rows: z.number().int().min(1).max(300) }).parse(payload); processes.terminalResize(v.id, v.cols, v.rows); },
  'terminal:close': payload => processes.closeTerminal(z.object({ id: z.string().max(100) }).parse(payload).id),
  'git:status': payload => git.status(store.get(pid.parse(payload).projectId).path),
  'git:history': payload => git.history(store.get(pid.parse(payload).projectId).path),
  'git:branches': payload => git.branches(store.get(pid.parse(payload).projectId).path),
  'git:diff': async payload => {
    const input = file.extend({ staged: z.boolean() }).parse(payload); const project = store.get(input.projectId);
    if (path.isAbsolute(input.path) || input.path.split(/[\\/]/).includes('..')) throw new Error('文件路径无效');
    const result = await git.diff(project.path, input.path, input.staged);
    if (!result && !input.staged) return readTextFile(project.path, input.path).catch(() => '没有可显示的文本差异');
    return result || '没有可显示的差异';
  },
  'git:conflict': async payload => {
    const input = file.parse(payload); const project = store.get(input.projectId);
    if (path.isAbsolute(input.path) || input.path.split(/[\\/]/).includes('..')) throw new Error('文件路径无效');
    const result = await readTextFile(project.path, input.path).catch(() => '');
    return git.conflict(project.path, input.path, result);
  },
  'files:list': payload => { const v = file.parse(payload); return listFiles(store.get(v.projectId).path, v.path); },
  'files:delete': async payload => {
    const v = file.extend({ path: z.string().min(1).max(4096), directory: z.boolean() }).parse(payload);
    await trashProjectEntry(store.get(v.projectId).path, v.path, v.directory, store.list().map(project => project.path), target => shell.trashItem(target));
  },
  'files:clipboard:read': () => readFileClipboard(),
  'files:clipboard:write': async payload => {
    const v = pid.extend({ paths: z.array(z.string().min(1).max(4096)).min(1).max(200) }).parse(payload);
    const sources = await Promise.all(v.paths.map(relative => withinProject(store.get(v.projectId).path, relative)));
    await checkFileCopy(store.get(v.projectId).path, '', sources);
    await writeFileClipboard([...new Set(sources)]);
  },
  'files:copy:check': async payload => {
    const v = copyRequest.parse(payload);
    return checkFileCopy(store.get(v.projectId).path, v.path, await copySources(v.sources));
  },
  'files:copy': async payload => {
    const v = copyRequest.extend({ conflict: z.enum(['rename', 'skip']) }).parse(payload);
    return copyFileEntries(store.get(v.projectId).path, v.path, await copySources(v.sources), v.conflict);
  },
  'files:create': payload => {
    const v = file.extend({ name: z.string().min(1).max(255), kind: z.enum(['file', 'directory']) }).parse(payload);
    return createFileEntry(store.get(v.projectId).path, v.path, v.name, v.kind);
  },
  'files:read': payload => { const v = file.parse(payload); return readTextFile(store.get(v.projectId).path, v.path); },
  'files:image': payload => { const v = file.parse(payload); return readImageFile(store.get(v.projectId).path, v.path); },
  'files:save': payload => {
    const v = file.extend({ content: z.string().max(1_000_000), original: z.string().max(1_000_000) }).parse(payload);
    return saveTextFile(store.get(v.projectId).path, v.path, v.content, v.original);
  },
  'files:open': async payload => {
    const v = file.parse(payload); const target = await withinProject(store.get(v.projectId).path, v.path);
    shell.showItemInFolder(target);
  },
  'project:reveal': async payload => { const project = store.get(pid.parse(payload).projectId); const error = await shell.openPath(project.path); if (error) throw new Error(error); },
  'url:open': async payload => {
    const { url } = z.object({ url: z.string().max(2048) }).parse(payload);
    const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('仅支持打开 HTTP / HTTPS 地址');
    await shell.openExternal(parsed.href);
  },
  metrics: () => {
    const metrics = app.getAppMetrics();
    return { workingSetMb: Math.round(metrics.reduce((sum, p) => sum + p.memory.workingSetSize, 0) / 1024),
      cpu: Math.round(metrics.reduce((sum, p) => sum + p.cpu.percentCPUUsage, 0) * 10) / 10, processCount: metrics.length };
  },
};
for (const operation of ['stage', 'unstage', 'commit', 'create-branch', 'switch', 'fetch', 'pull', 'merge-remote', 'push', 'merge', 'abort']) {
  handlers[`git:${operation}`] = async payload => {
    const v = pid.extend({ paths: z.array(z.string().max(4096)).max(100_000).optional(), message: z.string().max(20_000).optional(), name: z.string().max(250).optional() }).parse(payload);
    if (v.paths?.some(p => !p || p.includes('\0') || path.isAbsolute(p) || p.split(/[\\/]/).includes('..'))) throw new Error('文件路径无效');
    return git.mutate(store.get(v.projectId).path, operation, v.paths ?? v.message ?? v.name);
  };
}

async function createWindow() {
  const rendererUrl = process.env.AIPM_RENDERER_URL;
  if (!rendererUrl || new URL(rendererUrl).hostname !== '127.0.0.1') throw new Error('请使用 npm.cmd run dev:desktop 启动桌面客户端');
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 1000, minHeight: 680, show: false,
    title: '项目工作台', backgroundColor: appearance.get() === 'light' ? '#edf3fa' : '#0b1220', autoHideMenuBar: true,
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden' as const, titleBarOverlay: titleBarColors() } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window!, { type: 'question', title: '未保存的文件',
      message: '有尚未保存的文件修改', detail: '离开后这些修改将丢失。', buttons: ['继续编辑', '放弃修改并离开'], defaultId: 0, cancelId: 0 });
    if (choice === 1) event.preventDefault();
  });
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== new URL(rendererUrl).origin) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on('close', event => {
    if (quitting || !processes.hasActive()) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(window!, { type: 'question', title: '关闭项目工作台',
      message: '仍有服务或终端在运行', detail: '关闭时将停止由工作台启动的服务和终端。', buttons: ['停止并退出', '继续使用'], defaultId: 1, cancelId: 1 });
    if (choice === 0) { quitting = true; void processes.shutdown().finally(() => app.quit()); }
  });
  window.on('closed', () => { window = null; });
  await window.loadURL(rendererUrl);
  revealWindow();
  reportLaunch('desktop-ready', { pid: process.pid, visible: window.isVisible(), rendererUrl });
}
function revealWindow() {
  if (!window || window.isDestroyed() || process.env.AIPM_QA === '1') return;
  if (window.isMinimized()) window.restore();
  window.show(); window.focus();
}
app.on('second-instance', revealWindow);
app.whenReady().then(async () => {
  if (!locked) return;
  store = new ProjectStore(app.getPath('userData')); await store.load();
  appearance = new ThemeStore(app.getPath('userData')); await appearance.load(); applyNativeTheme();
  ipcMain.handle('pm:request', async (event, input: unknown) => {
    try {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('请求来源无效');
      const request = z.object({ action: z.string().max(80), payload: z.unknown().optional() }).parse(input);
      const handler = Object.hasOwn(handlers, request.action) ? handlers[request.action] : null;
      if (!handler) throw new Error('不支持的操作');
      return { ok: true, value: await handler(request.payload) };
    } catch (error) { return { ok: false, error: error instanceof z.ZodError ? '输入内容格式无效，请检查填写内容' : (error as Error).message }; }
  });
  await createWindow();
}).catch(error => { dialog.showErrorBox('项目工作台启动失败', (error as Error).message); app.quit(); });
app.on('window-all-closed', () => { if (!quitting) { quitting = true; void processes.shutdown().finally(() => app.quit()); } });
app.on('before-quit', event => {
  if (!quitting && processes.hasActive()) {
    event.preventDefault(); quitting = true; void processes.shutdown().finally(() => app.quit());
  }
});
