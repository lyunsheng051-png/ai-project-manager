<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { useFileTree, type FileTreeRow } from '@/composables/useFileTree';
import { fileSize } from '@/config/display';
import type { Project, FileEntry } from '@/types';
import { useWorkspace } from '@/composables/useWorkspace';
import { gitDecorations, gitToneLabels } from '@/config/gitDecorations';
import { isImageFile } from '../../../shared/file-kinds';

const props = defineProps<{ project: Project; selectedPath?: string }>();
const emit = defineEmits<{ select: [entry: FileEntry] }>();
const tree = useFileTree(props.project); const element = ref<HTMLElement>(); const focusedPath = ref('');
const ws = useWorkspace();
const decorations = computed(() => gitDecorations(ws.activeId.value === props.project.id ? ws.gitStatus.value?.files ?? [] : []));
function tone(path: string) { return decorations.value.get(path) ?? 'normal'; }
async function refresh() { await Promise.all([tree.refresh(), ws.refreshGit()]); }
watch(tree.rows, rows => { if (!rows.some(row => row.entry.path === focusedPath.value)) focusedPath.value = ''; });
function choose(row: FileTreeRow) {
  focusedPath.value = row.entry.path;
  if (row.entry.directory) void tree.toggle(row.entry); else emit('select', row.entry);
}
async function focus(path: string) {
  focusedPath.value = path; await nextTick();
  [...(element.value?.querySelectorAll<HTMLButtonElement>('[role="treeitem"]') ?? [])].find(item => item.dataset.path === path)?.focus();
}
async function keydown(event: KeyboardEvent, row: FileTreeRow) {
  if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const rows = tree.rows.value; const index = rows.findIndex(item => item.entry.path === row.entry.path);
  if (event.key === 'Home') await focus(rows[0]!.entry.path);
  else if (event.key === 'End') await focus(rows.at(-1)!.entry.path);
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') await focus(rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]!.entry.path);
  else if (event.key === 'ArrowRight' && row.entry.directory) {
    if (!tree.expanded.has(row.entry.path) || tree.errors.has(row.entry.path)) await tree.toggle(row.entry);
    else if (rows[index + 1]?.depth === row.depth + 1) await focus(rows[index + 1]!.entry.path);
  } else if (event.key === 'ArrowLeft') {
    if (row.entry.directory && tree.expanded.has(row.entry.path)) tree.expanded.delete(row.entry.path);
    else await focus(row.entry.path.split('/').slice(0, -1).join('/'));
  }
}
onMounted(refresh);
</script>
<template>
  <div class="file-tree-panel">
    <div class="file-tree-toolbar"><span>项目文件</span><div><button class="pane-action icon-only" aria-label="全部收起" title="收起所有子目录" @click="tree.collapseAll"><AppIcon name="Folder" :size="14" /></button><button class="pane-action icon-only" :disabled="tree.refreshing.value" aria-label="刷新目录" title="刷新目录与 Git 状态，保留展开状态" @click="refresh"><AppIcon name="RefreshCw" :size="14" :class="{ spin: tree.refreshing.value }" /></button></div></div>
    <div ref="element" class="file-tree" role="tree" aria-label="项目文件目录">
      <button v-for="row in tree.rows.value" :key="row.entry.path" class="file-tree-row" :class="{ selected: !row.entry.directory && selectedPath === row.entry.path, root: !row.entry.path, 'has-error': tree.errors.has(row.entry.path) }" role="treeitem" :aria-label="row.entry.name" :aria-level="row.depth" :aria-expanded="row.entry.directory ? tree.expanded.has(row.entry.path) : undefined" :aria-selected="!row.entry.directory && selectedPath === row.entry.path" :aria-busy="tree.pending.has(row.entry.path) || undefined" :tabindex="focusedPath === row.entry.path ? 0 : -1" :data-path="row.entry.path" :title="tree.errors.get(row.entry.path) || row.entry.path || project.path" :style="{ paddingLeft: `${8 + (row.depth - 1) * 16}px` }" @focus="focusedPath = row.entry.path" @click="choose(row)" @keydown="keydown($event, row)">
        <AppIcon v-if="row.entry.directory" :name="tree.pending.has(row.entry.path) ? 'Loader' : tree.errors.has(row.entry.path) ? 'RefreshCw' : tree.expanded.has(row.entry.path) ? 'ChevronDown' : 'ChevronRight'" :size="12" class="tree-chevron" :class="{ spin: tree.pending.has(row.entry.path) }" /><span v-else class="tree-chevron-placeholder" />
        <AppIcon :name="row.entry.directory ? tree.expanded.has(row.entry.path) ? 'FolderOpen' : 'Folder' : isImageFile(row.entry.name) ? 'Image' : 'FileText'" :size="15" :class="row.entry.directory ? 'tree-folder-icon' : 'tree-file-icon'" />
        <span class="tree-entry-name" :class="`git-${tone(row.entry.path)}`" :title="`${row.entry.path || project.path} · ${gitToneLabels[tone(row.entry.path)]}`">{{ row.entry.name }}</span>
        <span v-if="tree.errors.has(row.entry.path)" class="tree-note">读取失败，点击重试</span><span v-else-if="row.entry.directory && tree.expanded.has(row.entry.path) && tree.children.has(row.entry.path) && !tree.children.get(row.entry.path)!.length" class="tree-note">空</span>
        <small v-else-if="!row.entry.directory">{{ fileSize(row.entry.size) }}</small>
      </button>
    </div>
  </div>
</template>
