<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import type { FileCreationKind } from '@/types';

const props = defineProps<{ x: number; y: number; location: string; canCopy: boolean }>();
const emit = defineEmits<{ create: [kind: FileCreationKind]; close: [restoreFocus: boolean]; copy: []; paste: []; remove: [] }>();
const menu = ref<HTMLElement>(); const left = ref(props.x); const top = ref(props.y);
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !menu.value?.contains(event.target)) emit('close', false);
}
function dismiss() { emit('close', false); }
function scroll(event: Event) { if (event.target instanceof Node && !menu.value?.contains(event.target)) dismiss(); }
function keydown(event: KeyboardEvent) {
  if (event.key === 'Delete') { event.preventDefault(); if (props.canCopy) emit('remove'); return; }
  if ((event.ctrlKey || event.metaKey) && ['c', 'v'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (event.key.toLowerCase() === 'v') emit('paste'); else if (props.canCopy) emit('copy');
    return;
  }
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault();
    emit('close', true); return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const items = [...(menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}
onMounted(async () => {
  await nextTick();
  if (!menu.value) return;
  const rect = menu.value.getBoundingClientRect();
  left.value = Math.max(8, Math.min(props.x, window.innerWidth - rect.width - 8));
  top.value = Math.max(8, Math.min(props.y, window.innerHeight - rect.height - 8));
  await nextTick(); menu.value?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  if (!menu.value) return;
  document.addEventListener('pointerdown', outside); window.addEventListener('blur', dismiss);
  window.addEventListener('resize', dismiss); window.addEventListener('scroll', scroll, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside); window.removeEventListener('blur', dismiss);
  window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', scroll, true);
});
</script>
<template>
  <Teleport to="body"><div ref="menu" class="file-tree-context-menu" role="menu" aria-label="文件操作" :style="{ left: `${left}px`, top: `${top}px` }" @keydown="keydown" @contextmenu.prevent>
    <div class="file-tree-context-location" :title="location">{{ location }}</div>
    <button role="menuitem" @click="emit('create', 'file')"><AppIcon name="FilePlus" :size="15" />新建文件</button>
    <button role="menuitem" @click="emit('create', 'directory')"><AppIcon name="FolderPlus" :size="15" />新建目录</button>
    <div class="file-tree-menu-separator" role="separator" />
    <button role="menuitem" :disabled="!canCopy" title="复制磁盘中的文件内容，未保存的编辑请先按 Ctrl+S 保存" @click="emit('copy')"><AppIcon name="Copy" :size="15" />复制<kbd>Ctrl+C</kbd></button>
    <button role="menuitem" @click="emit('paste')"><AppIcon name="ClipboardPaste" :size="15" />粘贴到此目录<kbd>Ctrl+V</kbd></button>
    <div class="file-tree-menu-separator" role="separator" />
    <button role="menuitem" class="danger-text" :disabled="!canCopy" @click="emit('remove')"><AppIcon name="Trash2" :size="15" />删除<kbd>Delete</kbd></button>
  </div></Teleport>
</template>
