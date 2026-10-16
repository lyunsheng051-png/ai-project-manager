<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import FileTree from './FileTree.vue';
import CodeEditor from './CodeEditor.vue';
import ImagePreview from './ImagePreview.vue';
import { useWorkspace } from '@/composables/useWorkspace';
import { useFileTabs, isDocumentDirty } from '@/composables/useFileTabs';
import { useFileSplitResize } from '@/composables/useFileSplitResize';
import { request } from '@/api/desktop';
import type { Project } from '@/types';

const props = withDefaults(defineProps<{ project: Project; visible?: boolean }>(), { visible: true });
const ws = useWorkspace(); const tabs = useFileTabs(props.project.id);
const tabBar = ref<HTMLElement>();
const columns = ref<HTMLElement>();
const split = useFileSplitResize(columns);
watch(() => props.visible, visible => { if (!visible) split.finish(); });
watch(tabs.activePath, async () => {
  await nextTick(); tabBar.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
function shortcut(event: KeyboardEvent) {
  if (!props.visible || event.defaultPrevented || !tabs.active.value) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault(); if (tabs.active.value.kind === 'text') void tabs.save();
  }
}
onMounted(() => { window.addEventListener('keydown', shortcut); window.addEventListener('beforeunload', tabs.beforeUnload); });
onBeforeUnmount(() => { window.removeEventListener('keydown', shortcut); window.removeEventListener('beforeunload', tabs.beforeUnload); });
</script>
<template>
  <section class="file-panel">
    <div ref="columns" class="file-columns" :class="{ 'is-resizing-files': split.dragging.value }" :style="{ gridTemplateColumns: `${split.width.value}px 5px minmax(0, 1fr)` }">
      <div :id="`file-tree-${project.id}`" class="file-list-column"><FileTree :project="project" :selected-path="tabs.activePath.value" @select="tabs.open" /></div>
      <div class="file-split-resizer" role="separator" aria-orientation="vertical" aria-label="调整文件目录宽度" :aria-controls="`file-tree-${project.id}`" :aria-valuemin="Math.round(split.minWidth.value)" :aria-valuemax="Math.round(split.maxWidth.value)" :aria-valuenow="split.width.value" tabindex="0" title="左右拖动调整宽度，双击恢复默认" @pointerdown="split.start" @pointermove="split.move" @pointerup="split.finish" @pointercancel="split.finish" @lostpointercapture="split.finish" @keydown="split.keydown" @dblclick="split.reset" />
      <div class="file-preview">
        <div v-if="tabs.documents.value.length" ref="tabBar" class="file-tabs" role="tablist" aria-label="打开的文件">
          <div v-for="document in tabs.documents.value" :key="document.id" class="file-tab" :class="{ active: document.entry.path === tabs.activePath.value }">
            <button :id="`file-tab-${document.id}`" role="tab" :aria-selected="document.entry.path === tabs.activePath.value" :aria-controls="`file-document-${document.id}`" :title="document.entry.path" @click="tabs.activePath.value = document.entry.path"><AppIcon :name="document.kind === 'image' ? 'Image' : 'FileText'" :size="13" /><span>{{ document.entry.name }}</span><i v-if="isDocumentDirty(document)" class="file-tab-dirty" title="未保存" aria-label="未保存" /></button>
            <button class="file-tab-close" :aria-label="`关闭文件 ${document.entry.path}`" :disabled="document.saving" title="关闭文件" @click="tabs.close(document)"><AppIcon name="X" :size="12" /></button>
          </div>
        </div>
        <div class="diff-header file-editor-header" :class="{ 'has-document': tabs.active.value }">
          <div class="pane-title"><AppIcon :name="tabs.active.value?.kind === 'image' ? 'Image' : 'FileText'" :size="14" /><span :class="{ mono: tabs.active.value }" :title="tabs.active.value?.entry.path">{{ tabs.active.value?.entry.path || '文件编辑器' }}</span><span v-if="tabs.active.value && isDocumentDirty(tabs.active.value)" class="unsaved-badge">未保存</span></div>
          <div v-if="tabs.active.value" class="file-editor-actions">
            <span v-if="tabs.active.value.saving" class="file-saving-hint"><AppIcon name="Loader" :size="13" class="spin" />保存中…</span>
            <button class="pane-action icon-only" :disabled="tabs.active.value.loading || tabs.active.value.saving" aria-label="重新读取文件" title="重新读取磁盘文件" @click="tabs.reload()"><AppIcon name="RefreshCw" :size="14" /></button>
            <button class="pane-action icon-only" aria-label="在文件夹中显示" title="在文件夹中显示" @click="ws.task('定位文件', () => request('files:open', { projectId: project.id, path: tabs.active.value!.entry.path }))"><AppIcon name="ExternalLink" :size="14" /></button>
          </div>
        </div>
        <div v-if="!tabs.documents.value.length" class="diff-empty"><AppIcon name="Files" :size="30" /><p>点击文件打开标签，文本可直接编辑，Ctrl+S 保存</p></div>
        <div v-for="document in tabs.documents.value" v-show="document.entry.path === tabs.activePath.value" :id="`file-document-${document.id}`" :key="document.id" class="file-document" role="tabpanel" :aria-labelledby="`file-tab-${document.id}`">
          <div v-if="document.loading" class="empty-inline">正在读取…</div>
          <div v-else-if="document.error" class="file-read-error"><AppIcon name="CircleAlert" :size="24" /><p>{{ document.error }}</p></div>
          <ImagePreview v-else-if="document.kind === 'image' && document.image" :image="document.image" :name="document.entry.name" />
          <CodeEditor v-else-if="document.kind === 'text'" v-model="document.draft" :path="document.entry.path" :active="visible && document.entry.path === tabs.activePath.value" :dirty="isDocumentDirty(document)" :line-ending="document.original.includes('\r\n') ? 'CRLF' : document.original.includes('\r') ? 'CR' : 'LF'" @save="tabs.save(document)" />
        </div>
      </div>
    </div>
  </section>
</template>
