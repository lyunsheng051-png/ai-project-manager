export type ServiceKind = 'frontend' | 'backend' | 'java' | 'task';
export interface ServiceProfile {
  id: string; name: string; kind: ServiceKind; directory: string; command: string;
  url: string; environment: Record<string, string>; dependsOn: string[]; evidence: string;
}
export interface Project {
  id: string; name: string; path: string; favorite: boolean; lastOpened: string;
  services: ServiceProfile[];
}
export type RunState = 'starting' | 'running' | 'ready' | 'stopping' | 'stopped' | 'failed';
export interface ServiceRun {
  projectId: string; serviceId: string; state: RunState; pid?: number;
  startedAt?: string; exitCode?: number; error?: string; url: string;
}
export interface TerminalSession { id: string; projectId: string; title: string; pid: number }
export interface GitFile {
  path: string; originalPath?: string; index: string; working: string;
  staged: boolean; unstaged: boolean; conflict: boolean;
}
export interface GitCommit { hash: string; shortHash: string; author: string; date: string; subject: string }
export interface GitBranch { name: string; hash: string; current: boolean }
export interface GitStatus {
  isRepository: boolean; branch: string; upstream: string; ahead: number; behind: number;
  files: GitFile[]; merging: boolean;
}
export interface FileEntry { name: string; path: string; directory: boolean; size: number }
export interface ImagePreviewData { dataUrl: string; mimeType: string; size: number }
export interface AppMetrics { workingSetMb: number; cpu: number; processCount: number }
export interface Bootstrap { projects: Project[]; runs: ServiceRun[]; version: string; platform: string }
export type DesktopEvent =
  | { type: 'service'; run: ServiceRun }
  | { type: 'output'; projectId: string; serviceId: string; data: string }
  | { type: 'terminal-data'; id: string; data: string }
  | { type: 'terminal-exit'; id: string; exitCode: number }
  | { type: 'projects'; projects: Project[] };
export interface ActionPayloads {
  bootstrap: undefined;
  'project:import': { path?: string };
  'project:clone': { url: string; name: string };
  'project:activate': { projectId: string };
  'project:favorite': { projectId: string };
  'project:remove': { projectId: string };
  'project:scan': { projectId: string };
  'service:save': { projectId: string; profile: ServiceProfile };
  'service:delete': { projectId: string; serviceId: string };
  'service:start': { projectId: string; serviceId: string };
  'service:stop': { projectId: string; serviceId: string };
  'service:start-all': { projectId: string };
  'service:stop-all': { projectId: string };
  'service:output': { projectId: string; serviceId: string };
  'terminal:create': { projectId: string };
  'terminal:write': { id: string; data: string };
  'terminal:resize': { id: string; cols: number; rows: number };
  'terminal:close': { id: string };
  'git:status': { projectId: string };
  'git:history': { projectId: string };
  'git:branches': { projectId: string };
  'git:diff': { projectId: string; path: string; staged: boolean };
  'git:stage': { projectId: string; paths: string[] };
  'git:unstage': { projectId: string; paths: string[] };
  'git:commit': { projectId: string; message: string };
  'git:create-branch': { projectId: string; name: string };
  'git:switch': { projectId: string; name: string };
  'git:fetch': { projectId: string };
  'git:pull': { projectId: string };
  'git:push': { projectId: string };
  'git:merge': { projectId: string; name: string };
  'git:abort': { projectId: string };
  'files:list': { projectId: string; path: string };
  'files:read': { projectId: string; path: string };
  'files:image': { projectId: string; path: string };
  'files:save': { projectId: string; path: string; content: string; original: string };
  'files:open': { projectId: string; path: string };
  'project:reveal': { projectId: string };
  'url:open': { url: string };
  metrics: undefined;
}
export interface ActionResults {
  bootstrap: Bootstrap;
  'project:import': Project | null; 'project:clone': Project | null;
  'project:activate': Project; 'project:favorite': Project; 'project:remove': void;
  'project:scan': Project;
  'service:save': Project; 'service:delete': Project;
  'service:start': void; 'service:stop': void; 'service:start-all': void; 'service:stop-all': void;
  'service:output': string;
  'terminal:create': TerminalSession; 'terminal:write': void; 'terminal:resize': void; 'terminal:close': void;
  'git:status': GitStatus; 'git:history': GitCommit[]; 'git:branches': GitBranch[]; 'git:diff': string;
  'git:stage': string; 'git:unstage': string; 'git:commit': string;
  'git:create-branch': string; 'git:switch': string; 'git:fetch': string; 'git:pull': string;
  'git:push': string; 'git:merge': string; 'git:abort': string;
  'files:list': FileEntry[]; 'files:read': string; 'files:image': ImagePreviewData; 'files:save': string; 'files:open': void;
  'project:reveal': void; 'url:open': void; metrics: AppMetrics;
}
export type Action = keyof ActionPayloads;
export type Request = <K extends Action>(action: K, payload: ActionPayloads[K]) => Promise<ActionResults[K]>;
export interface DesktopBridge {
  request: Request;
  subscribe: (listener: (event: DesktopEvent) => void) => () => void;
}
