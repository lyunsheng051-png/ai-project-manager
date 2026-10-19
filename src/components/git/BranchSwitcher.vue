<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { request } from '@/api/desktop';
import { useWorkspace } from '@/composables/useWorkspace';
import { changeRepository, useRepositoryState } from '@/composables/useRepositoryState';
import type { GitBranch, GitStatus } from '@/types';

const props = defineProps<{ projectId: string; status: GitStatus }>();
const ws = useWorkspace(); const repository = useRepositoryState(props.projectId);
const anchor = ref<HTMLElement>(); const popup = ref<HTMLElement>(); const searchInput = ref<HTMLInputElement>();
const open = ref(false); const loading = ref(false); const error = ref(''); const search = ref('');
const branches = ref<GitBranch[]>([]); const position = ref({ left: '0px', top: '0px', width: '300px', maxHeight: '360px' });
const filtered = computed(() => branches.value.filter(branch => branch.name.toLowerCase().includes(search.value.toLowerCase()))
  .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name)));
let generation = 0;
function place() {
  const rect = anchor.value?.getBoundingClientRect(); if (!rect) return;
  const width = Math.min(340, window.innerWidth - 16);
  const top = rect.bottom + 7;
  position.value = { left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${Math.max(100, window.innerHeight - top - 12)}px` };
}
async function load() {
  const current = ++generation; loading.value = true; error.value = '';
  try { const items = await request('git:branches', { projectId: props.projectId }); if (current === generation) branches.value = items; }
  catch (failure) { if (current === generation) error.value = failure instanceof Error ? failure.message : String(failure); }
  finally { if (current === generation) loading.value = false; }
}
async function toggle() {
  if (repository.busy.value) return;
  if (open.value) { close(); return; }
  open.value = true; search.value = ''; place();
  await nextTick(); searchInput.value?.focus(); void load();
}
function close(restore = false) {
  open.value = false; generation++; loading.value = false;
  if (restore) anchor.value?.focus();
}
async function select(branch: GitBranch) {
  if (repository.busy.value) return;
  if (branch.current || branch.name === props.status.branch) { close(true); return; }
  await ws.task('切换分支', async () => {
    const changed = await changeRepository(props.projectId, () => request('git:switch', { projectId: props.projectId, name: branch.name }));
    if (!changed) return;
    await ws.refreshGit(); ws.notify(`已切换到分支 ${branch.name}`); close(true);
  });
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !anchor.value?.contains(event.target) && !popup.value?.contains(event.target)) close();
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); close(event.key === 'Escape'); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || (event.target === searchInput.value && ['Home', 'End'].includes(event.key))) return;
  event.preventDefault();
  const items = [...(popup.value?.querySelectorAll<HTMLButtonElement>('[data-branch]:not(:disabled)') ?? [])];
  if (!items.length) return;
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('resize', place); });
onBeforeUnmount(() => { generation++; document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); });
</script>
<template>
  <button ref="anchor" class="branch-badge branch-switcher" :disabled="repository.busy.value" :title="`当前分支：${status.branch}，点击切换本地分支`" aria-label="切换本地分支" aria-haspopup="dialog" :aria-expanded="open" @click="toggle"><AppIcon :name="repository.busy.value ? 'Loader' : 'GitBranch'" :size="13" :class="{ spin: repository.busy.value }" /><span class="branch-name">{{ status.branch }}</span><span v-if="status.ahead" class="mono">↑{{ status.ahead }}</span><span v-if="status.behind" class="mono">↓{{ status.behind }}</span><AppIcon name="ChevronDown" :size="11" /></button>
  <Teleport to="body"><section v-if="open" ref="popup" class="branch-picker" :style="position" role="dialog" aria-label="切换本地分支" :aria-busy="repository.busy.value || loading" @keydown="keydown">
    <header><span>本地分支</span><small>{{ branches.length }}</small><button class="icon-button" :disabled="loading || repository.busy.value" aria-label="刷新本地分支" title="刷新本地分支" @click="load"><AppIcon name="RefreshCw" :size="13" /></button></header>
    <div class="branch-picker-search"><AppIcon name="Search" :size="14" /><input ref="searchInput" v-model="search" aria-label="搜索本地分支" placeholder="搜索分支…" :disabled="repository.busy.value" /></div>
    <div v-if="loading" class="empty-inline">正在读取本地分支…</div>
    <div v-else-if="error" class="branch-picker-error"><p>{{ error }}</p><button class="button small" @click="load">重试</button></div>
    <div v-else class="branch-picker-list"><button v-for="branch in filtered" :key="branch.name" data-branch :class="{ current: branch.current }" :disabled="repository.busy.value" :title="branch.name" @click="select(branch)"><AppIcon name="GitBranch" :size="14" /><span>{{ branch.name }}</span><small v-if="branch.current">当前</small><AppIcon v-if="branch.current" name="Check" :size="13" /></button><p v-if="!filtered.length" class="empty-inline">{{ branches.length ? '没有匹配的本地分支' : '首次提交后可切换本地分支' }}</p></div>
  </section></Teleport>
</template>
