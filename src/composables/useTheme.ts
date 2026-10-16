import { computed, readonly, ref } from 'vue';
import { request } from '@/api/desktop';
import type { ThemeMode } from '@/types';

const STORAGE_KEY = 'workspace-theme';
function cachedTheme(): ThemeMode {
  try { return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}
const theme = ref<ThemeMode>(cachedTheme());
const busy = ref(false);
const isDark = computed(() => theme.value === 'dark');

function apply(value: ThemeMode) {
  document.documentElement.dataset.theme = value;
  theme.value = value;
}
function cache(value: ThemeMode) {
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* 桌面端仍保存在应用数据目录 */ }
}
export async function initializeTheme() {
  apply(theme.value);
  if (window.desktop) {
    try {
      const saved = await request('theme:get', undefined);
      apply(saved); cache(saved);
    } catch { /* 使用缓存；外观设置不阻止启动 */ }
  }
}
async function setTheme(value: ThemeMode) {
  if (busy.value || value === theme.value) return;
  const previous = theme.value;
  busy.value = true; apply(value);
  try {
    if (window.desktop) await request('theme:set', { theme: value });
    cache(value);
  } catch (error) {
    apply(previous);
    throw new Error(`主题设置未保存，已恢复原主题：${error instanceof Error ? error.message : String(error)}`);
  } finally { busy.value = false; }
}
export function useTheme() {
  return { theme: readonly(theme), busy: readonly(busy), isDark, setTheme,
    toggle: () => setTheme(theme.value === 'dark' ? 'light' : 'dark') };
}
