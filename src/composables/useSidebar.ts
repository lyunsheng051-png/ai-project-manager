import { readonly, ref } from 'vue';
import { request } from '@/api/desktop';

const STORAGE_KEY = 'sidebar-collapsed';
function cachedCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}
const collapsed = ref(cachedCollapsed());
const busy = ref(false);
function cache(value: boolean) {
  try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* 桌面端仍保存到应用数据目录 */ }
}
export async function initializeSidebar() {
  if (!window.desktop) return;
  try {
    collapsed.value = await request('layout:sidebar:get', undefined);
    cache(collapsed.value);
  } catch { /* 使用缓存，不阻止工作台启动 */ }
}
async function setCollapsed(value: boolean) {
  if (busy.value || value === collapsed.value) return;
  const previous = collapsed.value;
  busy.value = true; collapsed.value = value;
  try {
    if (window.desktop) await request('layout:sidebar:set', { collapsed: value });
    cache(value);
  } catch (error) {
    collapsed.value = previous;
    throw new Error(`侧栏状态未保存：${error instanceof Error ? error.message : String(error)}`);
  } finally { busy.value = false; }
}
export function useSidebar() {
  return { collapsed: readonly(collapsed), busy: readonly(busy), setCollapsed,
    toggle: () => setCollapsed(!collapsed.value) };
}
