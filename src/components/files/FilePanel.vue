<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import PaginationControls from '@/components/common/PaginationControls.vue';
import { useWorkspace } from '@/composables/useWorkspace';
import { usePagination } from '@/composables/usePagination';
import { request } from '@/api/desktop';
import { fileSize } from '@/config/display';
import type { Project, FileEntry } from '@/types';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
const props = defineProps<{ project: Project }>(); const ws = useWorkspace();
const directory = ref(''); const entries = ref<FileEntry[]>([]); const selected = ref<FileEntry>(); const content = ref(''); const loading = ref(false); let sequence = 0;
const draft = ref(''); const editing = ref(false); const saving = ref(false); const readError = ref(''); const editor = ref<HTMLTextAreaElement>();
const normalize = (value: string) => value.replace(/\r\n|\r/g, '\n');
const dirty = computed(() => draft.value !== normalize(content.value));
const newline = computed(() => content.value.includes('\r\n') ? 'CRLF' : content.value.includes('\r') ? 'CR' : 'LF');
const breadcrumbs = computed(() => directory.value.split('/').filter(Boolean)); const pager = usePagination(() => entries.value);
function canLeave() {
  if (saving.value) { ws.notify('正在保存文件，请稍候'); return false; }
  return !dirty.value || confirm(`“${selected.value?.name}”有未保存的修改，是否放弃这些修改？`);
}
useUnsavedChanges(canLeave);
async function load(relative = directory.value) {
  await ws.task('读取目录', async () => { entries.value = await request('files:list', { projectId: props.project.id, path: relative }); directory.value = relative; pager.page.value = 1; });
}
async function open(entry: FileEntry, reload = false) {
  if (entry.directory) { await load(entry.path); return; }
  if ((!reload && entry.path === selected.value?.path) || !canLeave()) return;
  selected.value = entry; content.value = ''; draft.value = ''; readError.value = ''; editing.value = false; loading.value = true; const current = ++sequence;
  await ws.task('读取文件', async () => {
    try {
      const value = await request('files:read', { projectId: props.project.id, path: entry.path });
      if (current === sequence) { content.value = value; draft.value = normalize(value); }
    } catch (error) { if (current === sequence) readError.value = (error as Error).message; throw error; }
  });
  if (current === sequence) loading.value = false;
}
async function edit() { editing.value = true; await nextTick(); editor.value?.focus(); }
function cancel() { if (canLeave()) { draft.value = normalize(content.value); editing.value = false; } }
async function save() {
  if (!selected.value || !editing.value || !dirty.value || saving.value || loading.value || readError.value) return;
  const entry = selected.value; saving.value = true;
  try {
    await ws.task('保存文件', async () => {
      const value = await request('files:save', { projectId: props.project.id, path: entry.path, content: draft.value, original: content.value });
      content.value = value; draft.value = normalize(value);
      entry.size = new TextEncoder().encode(value).length;
      await ws.refreshGit(); ws.notify('文件已保存');
    });
  } finally { saving.value = false; }
}
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && editing.value) { event.preventDefault(); void save(); }
}
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || saving.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(() => { void load(''); window.addEventListener('keydown', shortcut); window.addEventListener('beforeunload', beforeUnload); });
onBeforeUnmount(() => { sequence++; window.removeEventListener('keydown', shortcut); window.removeEventListener('beforeunload', beforeUnload); });
</script>
<template>
  <section class="file-panel"><div class="file-toolbar"><div class="breadcrumbs"><button @click="load('')"><AppIcon name="Folder" :size="14" />{{ project.name }}</button><template v-for="(part, index) in breadcrumbs" :key="index"><AppIcon name="ChevronRight" :size="13" /><button @click="load(breadcrumbs.slice(0, index + 1).join('/'))">{{ part }}</button></template></div><button class="button small" @click="load()"><AppIcon name="RefreshCw" :size="14" />刷新目录</button></div>
    <div class="file-columns"><div class="file-list-column"><div class="file-list"><button v-if="directory" class="file-row" @click="load(breadcrumbs.slice(0, -1).join('/'))"><AppIcon name="ArrowLeft" /><span>上级目录</span></button><button v-for="entry in pager.rows.value" :key="entry.path" class="file-row" :class="{ selected: selected?.path === entry.path }" @click="open(entry)"><AppIcon :name="entry.directory ? 'Folder' : 'FileText'" :class="{ 'folder-icon': entry.directory }" /><span>{{ entry.name }}</span><small>{{ entry.directory ? '' : fileSize(entry.size) }}</small><AppIcon v-if="entry.directory" name="ChevronRight" :size="13" /></button><p v-if="!entries.length" class="empty-inline">目录中没有可显示的文件。</p></div><PaginationControls compact :total="pager.total.value" :page="pager.page.value" :size="pager.size.value" @update:page="pager.page.value = $event" @update:size="pager.size.value = $event" /></div>
      <div class="file-preview">
        <div class="diff-header file-editor-header">
          <div class="pane-title"><AppIcon name="FileText" :size="14" /><span :class="{ mono: selected }" :title="selected?.path">{{ selected?.path || '文本文件' }}</span><span v-if="dirty" class="unsaved-badge">未保存</span></div>
          <div v-if="selected" class="file-editor-actions">
            <button class="pane-action icon-only" :disabled="loading || saving" aria-label="重新读取文件" title="重新读取磁盘文件" @click="open(selected!, true)"><AppIcon name="RefreshCw" :size="14" /></button>
            <template v-if="!loading && !readError">
              <template v-if="editing"><button class="pane-action" :disabled="saving" @click="cancel">取消编辑</button><button class="pane-action emphasized" :disabled="!dirty || saving" @click="save"><AppIcon :name="saving ? 'Loader' : 'Save'" :class="{ spin: saving }" :size="14" />{{ saving ? '保存中…' : '保存' }}</button></template>
              <button v-else class="pane-action emphasized" @click="edit"><AppIcon name="Pencil" :size="14" />编辑</button>
            </template>
            <button class="pane-action icon-only" aria-label="在文件夹中显示" title="在文件夹中显示" @click="ws.task('定位文件', () => request('files:open', { projectId: project.id, path: selected!.path }))"><AppIcon name="ExternalLink" :size="14" /></button>
          </div>
        </div>
        <div v-if="!selected" class="diff-empty"><AppIcon name="FileText" :size="30" /><p>选择文本文件查看或编辑</p></div>
        <div v-else-if="loading" class="empty-inline">正在读取…</div>
        <div v-else-if="readError" class="file-read-error"><AppIcon name="CircleAlert" :size="24" /><p>{{ readError }}</p></div>
        <template v-else-if="editing"><textarea ref="editor" v-model="draft" class="file-editor" aria-label="文件内容" :readonly="saving" :spellcheck="false" wrap="off" /><div class="file-editor-status"><span>{{ dirty ? '未保存修改' : '已保存' }}<span>·</span>UTF-8<span>·</span>{{ newline }}</span><span>Ctrl+S 保存</span></div></template>
        <pre v-else class="file-content">{{ content }}</pre>
      </div>
    </div>
  </section>
</template>
