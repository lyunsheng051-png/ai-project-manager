import { computed, reactive, ref, watch, type Ref } from 'vue';
import type { FileTreeRow } from './useFileTree';

interface SelectionModifiers { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }
export function useFileSelection(rows: Ref<FileTreeRow[]>, refreshing: Ref<boolean>) {
  const paths = reactive(new Set<string>()); const anchor = ref<string>();
  const entries = computed(() => rows.value.filter(row => paths.has(row.entry.path)).map(row => row.entry));
  function replace(path?: string) {
    paths.clear(); if (path) paths.add(path); anchor.value = path || undefined;
  }
  function select(path: string, modifiers: SelectionModifiers = {}) {
    const additive = modifiers.ctrlKey || modifiers.metaKey;
    if (modifiers.shiftKey) {
      const visible = rows.value; const end = visible.findIndex(row => row.entry.path === path);
      const start = visible.findIndex(row => row.entry.path === anchor.value);
      if (!additive) paths.clear();
      if (start < 0 || end < 0) { if (path) paths.add(path); anchor.value = path || undefined; return; }
      for (const row of visible.slice(Math.min(start, end), Math.max(start, end) + 1)) if (row.entry.path) paths.add(row.entry.path);
    } else if (additive) {
      if (path) { if (paths.has(path)) paths.delete(path); else paths.add(path); }
      anchor.value = path || undefined;
    } else replace(path);
  }
  function all() {
    paths.clear(); for (const row of rows.value) if (row.entry.path) paths.add(row.entry.path);
    anchor.value = rows.value.find(row => paths.has(row.entry.path))?.entry.path;
  }
  watch([rows, refreshing], () => {
    if (refreshing.value) return;
    const visible = new Set(rows.value.map(row => row.entry.path));
    for (const path of paths) if (!visible.has(path)) paths.delete(path);
    if (anchor.value && !visible.has(anchor.value)) anchor.value = entries.value[0]?.path;
  });
  return { paths, entries, select, replace, all };
}
