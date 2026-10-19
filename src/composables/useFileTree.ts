import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { request } from '@/api/desktop';
import { useWorkspace } from './useWorkspace';
import type { FileEntry, Project } from '@/types';

export interface FileTreeRow { entry: FileEntry; depth: number }

export function useFileTree(project: Project) {
  const ws = useWorkspace();
  const children = reactive(new Map<string, FileEntry[]>());
  const expanded = reactive(new Set<string>(['']));
  const pending = reactive(new Set<string>());
  const errors = reactive(new Map<string, string>());
  const refreshing = ref(false);
  const root: FileEntry = { name: project.name, path: '', directory: true, size: 0 };
  let generation = 0;

  const rows = computed(() => {
    const result: FileTreeRow[] = []; const stack = [{ entry: root, depth: 1 }];
    while (stack.length) {
      const row = stack.pop()!; result.push(row);
      if (row.entry.directory && expanded.has(row.entry.path)) {
        const entries = children.get(row.entry.path) ?? [];
        for (let index = entries.length - 1; index >= 0; index--) stack.push({ entry: entries[index]!, depth: row.depth + 1 });
      }
    }
    return result;
  });

  async function load(path: string, current = generation) {
    if (pending.has(path)) return;
    pending.add(path); errors.delete(path);
    await ws.task('读取目录', async () => {
      try {
        const entries = await request('files:list', { projectId: project.id, path });
        if (current === generation) children.set(path, entries);
      } catch (error) {
        if (current === generation) { errors.set(path, (error as Error).message); throw error; }
      } finally { if (current === generation) pending.delete(path); }
    });
  }
  async function toggle(entry: FileEntry) {
    if (!entry.directory) return;
    if (expanded.has(entry.path) && !errors.has(entry.path)) { expanded.delete(entry.path); return; }
    expanded.add(entry.path);
    await loadBranch(entry.path);
  }
  async function loadBranch(path: string, current = generation) {
    const queue = [path];
    while (queue.length && current === generation) {
      const path = queue.shift()!;
      if (!children.has(path) || errors.has(path)) await load(path, current);
      if (expanded.has(path)) {
        for (const child of children.get(path) ?? []) if (child.directory && expanded.has(child.path)) queue.push(child.path);
      }
    }
  }
  async function refresh() {
    if (refreshing.value) return;
    refreshing.value = true; const current = ++generation;
    children.clear(); pending.clear(); errors.clear();
    try {
      // 只重新读取仍然存在且已经展开的目录，保留当前展开状态。
      await loadBranch('', current);
    } finally { if (current === generation) refreshing.value = false; }
  }
  function collapseAll() { expanded.clear(); expanded.add(''); }
  async function revealCreated(entry: FileEntry) {
    await revealEntries([entry]);
  }
  async function revealEntries(entries: FileEntry[]) {
    expanded.add('');
    for (const entry of entries) {
      const parts = entry.path.split('/'); parts.pop();
      for (let index = 1; index <= parts.length; index++) expanded.add(parts.slice(0, index).join('/'));
      if (entry.directory) expanded.add(entry.path);
    }
    await refresh();
  }
  onBeforeUnmount(() => { generation++; });
  return { rows, children, expanded, pending, errors, refreshing, toggle, refresh, collapseAll, revealCreated, revealEntries };
}
