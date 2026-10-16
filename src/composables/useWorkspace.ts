import { computed, ref, shallowRef } from 'vue';
import { request } from '@/api/desktop';
import { confirmWorkspaceNavigation } from './useUnsavedChanges';
import type { Project, ServiceRun, GitStatus, TerminalSession, AppMetrics, DesktopEvent } from '@/types';

const projects = ref<Project[]>([]);
const activeId = ref(localStorage.getItem('active-project') || '');
const activeProject = computed(() => projects.value.find(p => p.id === activeId.value) ?? null);
const runs = ref<ServiceRun[]>([]);
const terminals = ref<TerminalSession[]>([]);
const terminalData = new Map<string, string>();
const eventListeners = new Set<(event: DesktopEvent) => void>();
const gitStatus = shallowRef<GitStatus | null>(null);
const gitError = ref('');
const ready = ref(false); const version = ref('0.1.0');
const metrics = ref<AppMetrics | null>(null);
const tasks = ref<string[]>([]);
const messages = ref<{ id: number; text: string; kind: 'error' | 'success' }[]>([]);
const dockOpen = ref(true); const dockTab = ref<'logs' | 'terminal'>('logs');
const selectedService = ref(''); const selectedTerminal = ref('');
let sequence = 0; let initialized = false; let refreshSequence = 0;

function notify(text: string, kind: 'error' | 'success' = 'success') {
  const id = ++sequence; messages.value = [...messages.value.slice(-3), { id, text, kind }];
  setTimeout(() => { messages.value = messages.value.filter(m => m.id !== id); }, kind === 'error' ? 12_000 : 4500);
}
async function task<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {
  tasks.value.push(label);
  try { return await work(); } catch (error) { notify((error as Error).message, 'error'); return undefined; }
  finally { const index = tasks.value.indexOf(label); if (index >= 0) tasks.value.splice(index, 1); }
}
async function refreshGit() {
  const id = activeId.value; const sequence = ++refreshSequence;
  if (!id) { gitStatus.value = null; return; }
  try {
    const status = await request('git:status', { projectId: id });
    if (sequence === refreshSequence && id === activeId.value) { gitStatus.value = status; gitError.value = ''; }
  } catch (error) { if (sequence === refreshSequence) { gitStatus.value = null; gitError.value = (error as Error).message; } }
}
async function activate(project: Project) {
  if (project.id !== activeId.value && !confirmWorkspaceNavigation()) return;
  activeId.value = project.id; localStorage.setItem('active-project', project.id);
  gitStatus.value = null; gitError.value = ''; selectedService.value = project.services[0]?.id || '';
  selectedTerminal.value = terminals.value.find(t => t.projectId === project.id)?.id || '';
  await task('打开项目', async () => { await request('project:activate', { projectId: project.id }); await refreshGit(); });
}
async function importProject() {
  await task('导入项目', async () => {
    const project = await request('project:import', {});
    if (project) { if (!projects.value.some(p => p.id === project.id)) projects.value.push(project); await activate(project); notify('项目已导入，运行前请核对启动配置'); }
  });
}
async function newTerminal() {
  if (!activeProject.value) return;
  await task('打开终端', async () => {
    const terminal = await request('terminal:create', { projectId: activeId.value });
    terminal.title = `终端 ${terminals.value.filter(t => t.projectId === terminal.projectId).length + 1}`;
    terminals.value.push(terminal); selectedTerminal.value = terminal.id; dockTab.value = 'terminal'; dockOpen.value = true;
  });
}
async function closeTerminal(id: string) {
  await task('关闭终端', async () => {
    await request('terminal:close', { id }); terminals.value = terminals.value.filter(t => t.id !== id); terminalData.delete(id);
    if (selectedTerminal.value === id) selectedTerminal.value = terminals.value.find(t => t.projectId === activeId.value)?.id || '';
  });
}
async function initialize() {
  if (initialized) return; initialized = true;
  window.desktop?.subscribe(event => {
    if (event.type === 'projects') {
      projects.value = event.projects;
      const projectIds = new Set(projects.value.map(p => p.id));
      const serviceKeys = new Set(projects.value.flatMap(p => p.services.map(s => `${p.id}:${s.id}`)));
      runs.value = runs.value.filter(r => serviceKeys.has(`${r.projectId}:${r.serviceId}`));
      for (const terminal of terminals.value) if (!projectIds.has(terminal.projectId)) terminalData.delete(terminal.id);
      terminals.value = terminals.value.filter(t => projectIds.has(t.projectId));
      if (!projects.value.some(p => p.id === activeId.value)) { activeId.value = projects.value[0]?.id || ''; selectedService.value = activeProject.value?.services[0]?.id || ''; void refreshGit(); }
    }
    if (event.type === 'service') {
      const index = runs.value.findIndex(r => r.projectId === event.run.projectId && r.serviceId === event.run.serviceId);
      if (index >= 0) runs.value[index] = event.run; else runs.value.push(event.run);
    }
    if (event.type === 'terminal-data') terminalData.set(event.id, ((terminalData.get(event.id) ?? '') + event.data).slice(-200_000));
    eventListeners.forEach(listener => listener(event));
  });
  if (!window.desktop) { ready.value = true; return; }
  await task('加载项目', async () => {
    const data = await request('bootstrap', undefined); projects.value = data.projects; runs.value = data.runs; version.value = data.version;
    const project = projects.value.find(p => p.id === activeId.value) || [...projects.value].sort((a, b) => b.lastOpened.localeCompare(a.lastOpened))[0];
    if (project) await activate(project);
  });
  ready.value = true;
  const updateMetrics = () => request('metrics', undefined).then(value => { metrics.value = value; }).catch(() => undefined);
  void updateMetrics(); setInterval(updateMetrics, 5000);
}
function listen(listener: (event: DesktopEvent) => void) { eventListeners.add(listener); return () => eventListeners.delete(listener); }
function runFor(serviceId: string) { return runs.value.find(r => r.projectId === activeId.value && r.serviceId === serviceId); }
export function useWorkspace() {
  return { projects, activeId, activeProject, runs, terminals, terminalData, gitStatus, gitError, ready, version, metrics, tasks,
    messages, dockOpen, dockTab, selectedService, selectedTerminal, notify, task, refreshGit, activate, importProject, newTerminal,
    closeTerminal, initialize, listen, runFor };
}
