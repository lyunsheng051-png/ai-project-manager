import { computed, onBeforeUnmount, ref } from 'vue';
import { request } from '@/api/desktop';
import { useWorkspace } from './useWorkspace';
import { useRepositoryGuard } from './useRepositoryState';
import type { FileCopyCheck, FileCopyConflict, FileCopyRequest, FileCopySource, FileEntry, Project } from '@/types';

export const fileDragType = 'application/x-aipm-file';

export function useFileTransfer(project: Project, completed: (entries: FileEntry[]) => Promise<void>) {
  const ws = useWorkspace(); const busy = ref(false); const activity = ref('');
  const pending = ref<{ request: FileCopyRequest; check: FileCopyCheck }>();
  const blocked = computed(() => busy.value || Boolean(pending.value));
  useRepositoryGuard(project.id, () => {
    if (blocked.value) { ws.notify('请先完成文件复制操作，再切换分支'); return false; }
    return true;
  });
  let disposed = false;
  onBeforeUnmount(() => { disposed = true; });

  async function execute(input: FileCopyRequest, conflict: FileCopyConflict) {
    busy.value = true; activity.value = `正在复制到 ${project.name}${input.path ? `/${input.path}` : ''}…`;
    try {
      const result = await request('files:copy', { ...input, conflict });
      if (!disposed) await completed(result.copied);
      const lines = [`已复制 ${result.copied.length} 项到 ${project.name}${input.path ? `/${input.path}` : ''}${result.skipped.length ? `，跳过 ${result.skipped.length} 个同名项` : ''}`];
      for (const failure of result.failed) lines.push(`${failure.name}：${failure.message}`);
      if (result.skippedLinks) lines.push(`已跳过 ${result.skippedLinks} 个符号链接或联接目录`);
      if (result.skippedGit) lines.push(`已跳过 ${result.skippedGit} 个 Git 内部目录或文件`);
      ws.notify(lines.join('\n'), result.failed.length ? 'error' : 'success');
    } catch (error) { ws.notify(error instanceof Error ? error.message : String(error), 'error'); }
    finally { busy.value = false; activity.value = ''; }
  }
  async function offer(sources: FileCopySource[], path: string) {
    if (blocked.value || !sources.length) return;
    if (sources.length > 200) { ws.notify('一次最多复制 200 个文件或目录，请分批操作', 'error'); return; }
    busy.value = true; activity.value = '正在检查复制位置…';
    const input: FileCopyRequest = { projectId: project.id, path, sources };
    try {
      const check = await request('files:copy:check', input);
      if (disposed) return;
      if (check.conflicts.length) pending.value = { request: input, check };
      else await execute(input, 'rename');
    } catch (error) { ws.notify(error instanceof Error ? error.message : String(error), 'error'); }
    finally { busy.value = false; activity.value = ''; }
  }
  async function accept(conflict: FileCopyConflict) {
    const input = pending.value?.request; pending.value = undefined;
    if (input) await execute(input, conflict);
  }
  async function copy(entry: FileEntry) {
    if (blocked.value || !entry.path) return;
    busy.value = true; activity.value = '正在复制到文件剪贴板…';
    try {
      await request('files:clipboard:write', { projectId: project.id, path: entry.path });
      ws.notify(`已复制 ${entry.name}，到目标目录按 Ctrl+V 粘贴`);
    } catch (error) { ws.notify(error instanceof Error ? error.message : String(error), 'error'); }
    finally { busy.value = false; activity.value = ''; }
  }
  async function paste(path: string) {
    if (blocked.value) return;
    busy.value = true; activity.value = '正在读取文件剪贴板…';
    let paths: string[] = [];
    try { paths = await request('files:clipboard:read', undefined); }
    catch (error) { ws.notify(error instanceof Error ? error.message : String(error), 'error'); return; }
    finally { busy.value = false; activity.value = ''; }
    if (disposed) return;
    if (!paths.length) { ws.notify('剪贴板中没有文件或目录，请先复制文件，或直接拖入目标目录'); return; }
    await offer(paths.map(externalPath => ({ externalPath })), path);
  }
  function canDrop(data: DataTransfer | null) {
    return !blocked.value && Boolean(data && (Array.from(data.types).includes(fileDragType) || Array.from(data.types).includes('Files')));
  }
  async function drop(data: DataTransfer, path: string) {
    if (blocked.value) return;
    try {
      const internal = data.getData(fileDragType);
      if (internal) {
        const source: unknown = JSON.parse(internal);
        if (!source || typeof source !== 'object' || !('projectId' in source) || !('path' in source) || typeof source.projectId !== 'string' || typeof source.path !== 'string') throw new Error('拖动的项目文件无效');
        await offer([{ projectId: source.projectId, path: source.path }], path);
      } else {
        if (!window.desktop?.getPathForFile) throw new Error('请重启桌面端后使用拖入文件功能');
        const paths = Array.from(data.files).map(file => window.desktop!.getPathForFile!(file));
        if (!paths.length || paths.some(value => !value)) throw new Error('无法取得本地文件路径，请从资源管理器拖入文件或目录');
        await offer([...new Set(paths)].map(externalPath => ({ externalPath })), path);
      }
    } catch (error) { ws.notify(error instanceof Error ? error.message : String(error), 'error'); }
  }
  return { busy, activity, pending, blocked, copy, paste, offer, accept, drop, canDrop, cancel: () => { pending.value = undefined; } };
}
