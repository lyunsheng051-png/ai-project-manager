<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import NewFileDialog from './NewFileDialog.vue';
import FileTreeContextMenu from './FileTreeContextMenu.vue';
import FileCopyConflictDialog from './FileCopyConflictDialog.vue';
import { fileDragType, useFileTransfer } from '@/composables/useFileTransfer';
import { useRepositoryState } from '@/composables/useRepositoryState';
import { useFileTree, type FileTreeRow } from '@/composables/useFileTree';
import { fileSize } from '@/config/display';
import type { Project, FileEntry, FileCreationKind } from '@/types';
import { useWorkspace } from '@/composables/useWorkspace';
import { gitDecorations, gitToneLabels } from '@/config/gitDecorations';
import { isImageFile } from '../../../shared/file-kinds';

const props = defineProps<{ project: Project; selectedPath?: string }>();
const emit = defineEmits<{ select: [entry: FileEntry]; remove: [entry: FileEntry] }>();
const tree = useFileTree(props.project); const element = ref<HTMLElement>(); const focusedPath = ref('');
const ws = useWorkspace();
const repository = useRepositoryState(props.project.id);
const creation = ref<{ kind: FileCreationKind; parentPath: string }>();
const contextMenu = ref<{ x: number; y: number; entry: FileEntry }>();
const dragTarget = ref<string>();
const transfer = useFileTransfer(props.project, async entries => {
  await tree.revealEntries(entries); await ws.refreshGit();
  if (entries[0]) {
    await focus(entries[0].path);
    if (entries.length === 1 && !entries[0].directory) emit('select', entries[0]);
  }
});
const decorations = computed(() => gitDecorations(ws.activeId.value === props.project.id ? ws.gitStatus.value?.files ?? [] : []));
function tone(path: string) { return decorations.value.get(path) ?? 'normal'; }
function parentPath(entry?: FileEntry) { return entry?.directory ? entry.path : entry?.path.split('/').slice(0, -1).join('/') ?? ''; }
function startCreate(kind: FileCreationKind, entry = tree.rows.value.find(row => row.entry.path === focusedPath.value)?.entry) {
  if (tree.refreshing.value || creation.value || transfer.blocked.value) return;
  creation.value = { kind, parentPath: parentPath(entry) }; contextMenu.value = undefined;
}
function showContext(event: MouseEvent, entry = tree.rows.value[0]!.entry) {
  if (tree.refreshing.value || creation.value || transfer.blocked.value) return;
  focusedPath.value = entry.path;
  contextMenu.value = { x: event.clientX, y: event.clientY, entry };
}
function closeMenu(restoreFocus: boolean) {
  const path = contextMenu.value?.entry.path; contextMenu.value = undefined;
  if (restoreFocus && path !== undefined) void focus(path);
}
function copyEntry(entry = tree.rows.value.find(row => row.entry.path === focusedPath.value)?.entry) {
  contextMenu.value = undefined;
  if (entry?.path) void transfer.copy(entry);
}
function pasteEntry(entry = tree.rows.value.find(row => row.entry.path === focusedPath.value)?.entry) {
  const target = parentPath(entry); contextMenu.value = undefined;
  void transfer.paste(target);
}
function removeEntry(entry = tree.rows.value.find(row => row.entry.path === focusedPath.value)?.entry) {
  contextMenu.value = undefined;
  if (entry?.path && !transfer.blocked.value && !tree.refreshing.value && !creation.value) emit('remove', entry);
}
async function afterDelete(path: string) {
  contextMenu.value = undefined;
  for (const expanded of tree.expanded) if (expanded === path || expanded.startsWith(`${path}/`)) tree.expanded.delete(expanded);
  await refresh(); await focus(path.split('/').slice(0, -1).join('/'));
}
function startDrag(event: DragEvent, entry: FileEntry) {
  if (!entry.path || transfer.blocked.value || creation.value || !event.dataTransfer) { event.preventDefault(); return; }
  contextMenu.value = undefined;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(fileDragType, JSON.stringify({ projectId: props.project.id, path: entry.path }));
}
function dragOver(event: DragEvent, entry = tree.rows.value[0]!.entry) {
  if (!transfer.canDrop(event.dataTransfer) || tree.refreshing.value || creation.value) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    dragTarget.value = undefined; return;
  }
  event.dataTransfer!.dropEffect = 'copy'; dragTarget.value = parentPath(entry);
}
function dragLeave(event: DragEvent) {
  if (!(event.relatedTarget instanceof Node) || !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) dragTarget.value = undefined;
}
function drop(event: DragEvent, entry = tree.rows.value[0]!.entry) {
  dragTarget.value = undefined; contextMenu.value = undefined;
  if (!creation.value && !tree.refreshing.value && event.dataTransfer && transfer.canDrop(event.dataTransfer)) void transfer.drop(event.dataTransfer, parentPath(entry));
}
function closeCreation() {
  const path = creation.value?.parentPath; creation.value = undefined;
  if (path !== undefined) void focus(path);
}
async function created(entry: FileEntry) {
  creation.value = undefined;
  await tree.revealCreated(entry); await ws.refreshGit(); await focus(entry.path);
  if (!entry.directory) emit('select', entry);
}
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
  if (event.key === 'Delete' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault(); removeEntry(row.entry); return;
  }
  if ((event.ctrlKey || event.metaKey) && ['c', 'v'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (event.key.toLowerCase() === 'c') copyEntry(row.entry); else pasteEntry(row.entry);
    return;
  }
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10') || (event.altKey && event.key === 'Insert')) {
    event.preventDefault();
    if (!tree.refreshing.value && !creation.value && !transfer.blocked.value) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      contextMenu.value = { x: rect.left + 24, y: rect.bottom, entry: row.entry };
    }
    return;
  }
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
watch(repository.revision, () => tree.refresh());
defineExpose({ refresh, afterDelete });
</script>
<template>
  <div class="file-tree-panel" :class="{ 'is-file-drop-target': dragTarget !== undefined }">
    <div class="file-tree-toolbar"><span>项目文件</span><div><button class="pane-action icon-only" :disabled="tree.refreshing.value || transfer.blocked.value" aria-label="新建文件" title="在当前目录新建文件（Alt+Insert）" @click="startCreate('file')"><AppIcon name="FilePlus" :size="14" /></button><button class="pane-action icon-only" :disabled="tree.refreshing.value || transfer.blocked.value" aria-label="新建目录" title="在当前目录新建目录" @click="startCreate('directory')"><AppIcon name="FolderPlus" :size="14" /></button><button class="pane-action icon-only" aria-label="全部收起" title="收起所有子目录" @click="tree.collapseAll"><AppIcon name="Folder" :size="14" /></button><button class="pane-action icon-only" :disabled="tree.refreshing.value || transfer.blocked.value" aria-label="刷新目录" title="刷新目录与 Git 状态，保留展开状态" @click="refresh"><AppIcon name="RefreshCw" :size="14" :class="{ spin: tree.refreshing.value }" /></button></div></div>
    <div ref="element" class="file-tree" role="tree" aria-label="项目文件目录" @paste.prevent="pasteEntry()" @copy.prevent="copyEntry()" @contextmenu.prevent="showContext($event)" @dragover.prevent="dragOver($event)" @drop.prevent="drop($event)" @dragleave="dragLeave" @dragend="dragTarget = undefined">
      <button v-for="row in tree.rows.value" :key="row.entry.path" class="file-tree-row" :class="{ selected: !row.entry.directory && selectedPath === row.entry.path, root: !row.entry.path, 'has-error': tree.errors.has(row.entry.path), 'context-target': contextMenu?.entry.path === row.entry.path, 'file-drop-target': row.entry.directory && dragTarget === row.entry.path }" role="treeitem" :aria-label="row.entry.name" :aria-level="row.depth" :aria-expanded="row.entry.directory ? tree.expanded.has(row.entry.path) : undefined" :aria-selected="!row.entry.directory && selectedPath === row.entry.path" :aria-busy="tree.pending.has(row.entry.path) || undefined" :tabindex="focusedPath === row.entry.path ? 0 : -1" :data-path="row.entry.path" :title="tree.errors.get(row.entry.path) || row.entry.path || project.path" :style="{ paddingLeft: `${8 + (row.depth - 1) * 16}px` }" @focus="focusedPath = row.entry.path" @click="choose(row)" @keydown="keydown($event, row)" @contextmenu.prevent.stop="showContext($event, row.entry)" :draggable="Boolean(row.entry.path) && !transfer.blocked.value" @dragstart="startDrag($event, row.entry)" @dragover.prevent.stop="dragOver($event, row.entry)" @drop.prevent.stop="drop($event, row.entry)">
        <AppIcon v-if="row.entry.directory" :name="tree.pending.has(row.entry.path) ? 'Loader' : tree.errors.has(row.entry.path) ? 'RefreshCw' : tree.expanded.has(row.entry.path) ? 'ChevronDown' : 'ChevronRight'" :size="12" class="tree-chevron" :class="{ spin: tree.pending.has(row.entry.path) }" /><span v-else class="tree-chevron-placeholder" />
        <AppIcon :name="row.entry.directory ? tree.expanded.has(row.entry.path) ? 'FolderOpen' : 'Folder' : isImageFile(row.entry.name) ? 'Image' : 'FileText'" :size="15" :class="row.entry.directory ? 'tree-folder-icon' : 'tree-file-icon'" />
        <span class="tree-entry-name" :class="`git-${tone(row.entry.path)}`" :title="`${row.entry.path || project.path} · ${gitToneLabels[tone(row.entry.path)]}`">{{ row.entry.name }}</span>
        <span v-if="tree.errors.has(row.entry.path)" class="tree-note">读取失败，点击重试</span><span v-else-if="row.entry.directory && tree.expanded.has(row.entry.path) && tree.children.has(row.entry.path) && !tree.children.get(row.entry.path)!.length" class="tree-note">空</span>
        <small v-else-if="!row.entry.directory">{{ fileSize(row.entry.size) }}</small>
      </button>
    </div>
    <div v-if="dragTarget !== undefined || transfer.busy.value" class="file-transfer-status" role="status"><AppIcon :name="transfer.busy.value ? 'Loader' : 'Copy'" :size="14" :class="{ spin: transfer.busy.value }" /><span>{{ transfer.busy.value ? transfer.activity.value : `复制到 ${project.name}${dragTarget ? `/${dragTarget}` : ''}` }}</span></div>
    <FileCopyConflictDialog v-if="transfer.pending.value" :location="`${project.name}${transfer.pending.value.request.path ? `/${transfer.pending.value.request.path}` : ''}`" :total="transfer.pending.value.check.names.length" :conflicts="transfer.pending.value.check.conflicts" @close="transfer.cancel" @confirm="transfer.accept" />
    <FileTreeContextMenu v-if="contextMenu" :x="contextMenu.x" :y="contextMenu.y" :location="`${project.name}${parentPath(contextMenu.entry) ? `/${parentPath(contextMenu.entry)}` : ''}`" :can-copy="Boolean(contextMenu.entry.path)" @create="startCreate($event, contextMenu?.entry)" @close="closeMenu" @copy="copyEntry(contextMenu?.entry)" @paste="pasteEntry(contextMenu?.entry)" @remove="removeEntry(contextMenu?.entry)" />
    <NewFileDialog v-if="creation" :project="project" :parent-path="creation.parentPath" :kind="creation.kind" @close="closeCreation" @created="created" />
  </div>
</template>
