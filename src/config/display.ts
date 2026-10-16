import type { RunState, ServiceKind } from '@/types';
export const stateLabels: Record<RunState, string> = { starting: '启动中', running: '运行中', ready: '已就绪', stopping: '停止中', stopped: '已停止', failed: '启动失败' };
export const kindLabels: Record<ServiceKind, string> = { frontend: '前端', backend: '后端', java: 'Java', task: '命令任务' };
export const pageSizes = [10, 20, 50];
export function shortDate(value: string) { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }); }
export function fileSize(value: number) { return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
