import * as pty from 'node-pty';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import type { DesktopEvent, Project, ServiceProfile, ServiceRun, TerminalSession } from '../../shared/contracts';
import { withinProject } from '../core/paths';

interface Managed { process: pty.IPty; output: string; run?: ServiceRun; projectId: string; dead: boolean; generation: string }
const MAX_OUTPUT = 200_000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export function orderServices(services: ServiceProfile[]): ServiceProfile[] {
  const byId = new Map(services.map(s => [s.id, s]));
  const done = new Set<string>(); const visiting = new Set<string>(); const result: ServiceProfile[] = [];
  function visit(id: string) {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error('服务启动依赖存在循环，请修改运行配置');
    const service = byId.get(id); if (!service) throw new Error('启动依赖中的服务不存在');
    visiting.add(id); service.dependsOn.forEach(visit); visiting.delete(id); done.add(id); result.push(service);
  }
  services.forEach(s => visit(s.id)); return result;
}

export class ProcessService {
  private services = new Map<string, Managed>();
  private terminals = new Map<string, Managed>();
  private allStarting = new Map<string, string>();
  private projectEpoch = new Map<string, number>();
  private serviceEpoch = new Map<string, number>();
  private closing = false;
  constructor(private emit: (event: DesktopEvent) => void) {}
  runs(): ServiceRun[] { return [...this.services.values()].filter(m => m.run).map(m => ({ ...m.run! })); }
  private key(projectId: string, serviceId: string) { return `${projectId}:${serviceId}`; }
  private spawn(command: string | null, cwd: string, environment: Record<string, string> = {}): pty.IPty {
    // 服务使用 cmd，避免 npm 被解析为受 PowerShell 执行策略限制的 npm.ps1。
    const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/bash';
    const args = command === null ? (process.platform === 'win32' ? ['/d'] : [])
      : process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command];
    const env = Object.fromEntries(Object.entries({ ...process.env, ...environment, TERM: 'xterm-256color' }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    return pty.spawn(shell, args, { name: 'xterm-256color', cwd, env, cols: 120, rows: 30, useConpty: true });
  }
  private stream(managed: Managed, event: (data: string) => DesktopEvent) {
    let pending = ''; let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => { if (pending) { this.emit(event(pending)); pending = ''; } timer = undefined; };
    managed.process.onData(data => {
      managed.output = (managed.output + data).slice(-MAX_OUTPUT);
      pending += data;
      if (!timer) timer = setTimeout(flush, 40);
    });
    managed.process.onExit(({ exitCode }) => {
      if (timer) clearTimeout(timer); flush(); managed.dead = true;
      if (managed.run) {
        managed.run.exitCode = exitCode;
        managed.run.state = managed.run.state === 'stopping' || this.closing || exitCode === 0 ? 'stopped' : 'failed';
        if (managed.run.state === 'failed') managed.run.error = `进程已退出（${exitCode}），请查看日志`;
        this.emit({ type: 'service', run: { ...managed.run } });
      }
    });
  }
  async start(project: Project, serviceId: string): Promise<void> {
    if (this.closing) throw new Error('应用正在关闭');
    const service = project.services.find(s => s.id === serviceId);
    if (!service) throw new Error('服务不存在');
    if (!service.command.trim()) throw new Error('请先编辑运行配置，填写启动命令');
    const key = this.key(project.id, serviceId);
    const projectEpoch = this.projectEpoch.get(project.id) ?? 0;
    const serviceEpoch = this.serviceEpoch.get(key) ?? 0;
    if (this.services.has(key) && !this.services.get(key)!.dead) throw new Error('服务已启动');
    const cwd = await withinProject(project.path, service.directory, true);
    // 在任何 await 后再次检查，避免连续点击造成重复进程。
    if (this.services.has(key) && !this.services.get(key)!.dead) throw new Error('服务已启动');
    if (service.url) {
      const url = new URL(service.url);
      if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) throw new Error('就绪地址目前只支持本机 localhost / 127.0.0.1');
      if (await this.portOpen(url.hostname.replace(/[\[\]]/g, ''), Number(url.port || (url.protocol === 'https:' ? 443 : 80)))) {
        throw new Error(`地址 ${service.url} 已有服务监听，请修改端口或确认现有进程`);
      }
    }
    if (this.services.has(key) && !this.services.get(key)!.dead) throw new Error('服务已启动');
    if (this.closing || projectEpoch !== (this.projectEpoch.get(project.id) ?? 0) || serviceEpoch !== (this.serviceEpoch.get(key) ?? 0)) throw new Error('启动已取消');
    for (const dependency of service.dependsOn) {
      const state = this.services.get(this.key(project.id, dependency))?.run?.state;
      if (state !== 'ready' && state !== 'running') throw new Error('请先启动依赖服务，或使用组合启动');
    }
    const process = this.spawn(service.command, cwd, service.environment);
    const run: ServiceRun = { projectId: project.id, serviceId, state: service.url ? 'starting' : 'running',
      pid: process.pid, startedAt: new Date().toISOString(), url: service.url };
    const managed: Managed = { process, output: '', run, projectId: project.id, dead: false, generation: randomUUID() };
    this.services.set(key, managed);
    this.stream(managed, data => ({ type: 'output', projectId: project.id, serviceId, data }));
    this.emit({ type: 'service', run: { ...run } });
    if (service.url) void this.monitorReady(managed, service.url);
  }
  private async monitorReady(managed: Managed, url: string) {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline && !managed.dead && managed.run?.state === 'starting') {
      const ready = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: 'manual' }).then(response => response.status < 500, () => false);
      if (ready && !managed.dead && managed.run?.state === 'starting') {
        managed.run.state = 'ready'; this.emit({ type: 'service', run: { ...managed.run } }); return;
      }
      await sleep(700);
    }
    if (!managed.dead && managed.run?.state === 'starting') {
      managed.run.state = 'running'; managed.run.error = '进程仍在运行，45 秒内未确认服务就绪，请检查地址或日志';
      this.emit({ type: 'service', run: { ...managed.run } });
    }
  }
  private portOpen(host: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
      const socket = connect({ host, port }); let settled = false;
      const finish = (value: boolean) => { if (settled) return; settled = true; socket.destroy(); resolve(value); };
      socket.setTimeout(500); socket.on('connect', () => finish(true)); socket.on('error', () => finish(false)); socket.on('timeout', () => finish(false));
    });
  }
  async startAll(project: Project): Promise<void> {
    if (this.allStarting.has(project.id)) throw new Error('组合启动正在进行');
    const ordered = orderServices(project.services);
    const token = randomUUID(); this.allStarting.set(project.id, token);
    try {
      for (const service of ordered) {
        if (this.allStarting.get(project.id) !== token || this.closing) break;
        const current = this.services.get(this.key(project.id, service.id));
        if (!current || current.dead) await this.start(project, service.id);
        const managed = this.services.get(this.key(project.id, service.id))!;
        while (!managed.dead && managed.run?.state === 'starting' && this.allStarting.get(project.id) === token) await sleep(200);
        if (managed.dead || managed.run?.error || managed.run?.state === 'stopping') throw new Error(`${service.name} 未就绪，已停止启动后续服务，请查看日志`);
      }
    } finally { if (this.allStarting.get(project.id) === token) this.allStarting.delete(project.id); }
  }
  output(projectId: string, serviceId: string): string { return this.services.get(this.key(projectId, serviceId))?.output ?? ''; }
  async stop(projectId: string, serviceId: string): Promise<void> {
    this.allStarting.delete(projectId);
    const key = this.key(projectId, serviceId);
    this.serviceEpoch.set(key, (this.serviceEpoch.get(key) ?? 0) + 1);
    const managed = this.services.get(key);
    if (!managed || managed.dead) return;
    managed.run!.state = 'stopping'; this.emit({ type: 'service', run: { ...managed.run! } });
    await this.kill(managed);
  }
  private async kill(managed: Managed) {
    if (managed.dead) return;
    if (process.platform === 'win32') {
      await new Promise<void>(resolve => execFile('taskkill.exe', ['/PID', String(managed.process.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve()));
      // taskkill 后等待 PTY 自然上报退出。立即再次 kill 会让 node-pty
      // 尝试 AttachConsole 到已经消失的进程，产生异步原生模块错误。
      const grace = Date.now() + 2500;
      while (!managed.dead && Date.now() < grace) await sleep(50);
      if (managed.dead) return;
    } else {
      try { process.kill(-managed.process.pid, 'SIGTERM'); } catch { /* PTY fallback */ }
    }
    try { managed.process.kill(); } catch { /* 已退出 */ }
    const deadline = Date.now() + 2500;
    while (!managed.dead && Date.now() < deadline) await sleep(50);
    if (!managed.dead) throw new Error('进程尚未确认退出，请查看终端和运行状态');
  }
  async stopAll(projectId: string) {
    this.allStarting.delete(projectId);
    this.projectEpoch.set(projectId, (this.projectEpoch.get(projectId) ?? 0) + 1);
    const entries = [...this.services.values()].filter(m => m.projectId === projectId && m.run && !m.dead).reverse();
    for (const managed of entries) await this.stop(projectId, managed.run!.serviceId);
  }
  async createTerminal(project: Project): Promise<TerminalSession> {
    const epoch = this.projectEpoch.get(project.id) ?? 0;
    const active = [...this.terminals.values()].filter(t => !t.dead).length;
    if (active >= 12) throw new Error('最多同时打开 12 个终端，请先关闭不使用的终端');
    const cwd = await withinProject(project.path, '.', true);
    if (this.closing || epoch !== (this.projectEpoch.get(project.id) ?? 0)) throw new Error('终端创建已取消');
    if ([...this.terminals.values()].filter(t => !t.dead).length >= 12) throw new Error('最多同时打开 12 个终端，请先关闭不使用的终端');
    const id = randomUUID(); const terminalProcess = this.spawn(null, cwd);
    const managed: Managed = { process: terminalProcess, output: '', projectId: project.id, dead: false, generation: id };
    this.terminals.set(id, managed);
    this.stream(managed, data => ({ type: 'terminal-data', id, data }));
    terminalProcess.onExit(({ exitCode }) => this.emit({ type: 'terminal-exit', id, exitCode }));
    return { id, projectId: project.id, title: process.platform === 'win32' ? '命令提示符' : '终端', pid: terminalProcess.pid };
  }
  terminalWrite(id: string, data: string) {
    const terminal = this.terminals.get(id); if (!terminal || terminal.dead) throw new Error('终端已退出');
    terminal.process.write(data);
  }
  terminalResize(id: string, cols: number, rows: number) {
    const terminal = this.terminals.get(id); if (terminal && !terminal.dead) terminal.process.resize(cols, rows);
  }
  async closeTerminal(id: string) {
    const terminal = this.terminals.get(id); if (!terminal) return;
    await this.kill(terminal); this.terminals.delete(id);
  }
  async removeProject(projectId: string) {
    await this.stopAll(projectId);
    for (const [id, terminal] of this.terminals) if (terminal.projectId === projectId) await this.closeTerminal(id);
    for (const [key, service] of this.services) if (service.projectId === projectId) this.services.delete(key);
    // 保留取消代次，让尚在等待目录/端口检查的启动请求也能识别移除操作。
  }
  async forgetService(projectId: string, serviceId: string) {
    await this.stop(projectId, serviceId);
    this.services.delete(this.key(projectId, serviceId));
  }
  hasActive() { return [...this.services.values(), ...this.terminals.values()].some(m => !m.dead); }
  async shutdown() {
    this.closing = true; this.allStarting.clear();
    await Promise.allSettled([...this.services.values(), ...this.terminals.values()].filter(m => !m.dead).map(m => this.kill(m)));
  }
}
