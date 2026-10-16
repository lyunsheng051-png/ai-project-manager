<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import PaginationControls from '@/components/common/PaginationControls.vue';
import { useWorkspace } from '@/composables/useWorkspace';
import { usePagination } from '@/composables/usePagination';
import { request } from '@/api/desktop';
import { fileSize } from '@/config/display';
import type { Project, FileEntry } from '@/types';
const props = defineProps<{ project: Project }>(); const ws = useWorkspace();
const directory = ref(''); const entries = ref<FileEntry[]>([]); const selected = ref<FileEntry>(); const content = ref(''); const loading = ref(false); let sequence = 0;
const breadcrumbs = computed(() => directory.value.split('/').filter(Boolean)); const pager = usePagination(() => entries.value);
async function load(relative = directory.value) {
  await ws.task('读取目录', async () => { entries.value = await request('files:list', { projectId: props.project.id, path: relative }); directory.value = relative; pager.page.value = 1; });
}
async function open(entry: FileEntry) {
  if (entry.directory) { await load(entry.path); return; }
  selected.value = entry; content.value = ''; loading.value = true; const current = ++sequence;
  await ws.task('读取文件', async () => { const value = await request('files:read', { projectId: props.project.id, path: entry.path }); if (current === sequence) content.value = value; });
  if (current === sequence) loading.value = false;
}
onMounted(() => load(''));
</script>
<template>
  <section class="file-panel"><div class="file-toolbar"><div class="breadcrumbs"><button @click="load('')"><AppIcon name="Folder" :size="14" />{{ project.name }}</button><template v-for="(part, index) in breadcrumbs" :key="index"><AppIcon name="ChevronRight" :size="13" /><button @click="load(breadcrumbs.slice(0, index + 1).join('/'))">{{ part }}</button></template></div><button class="button small" @click="load()"><AppIcon name="RefreshCw" :size="14" />刷新目录</button></div>
    <div class="file-columns"><div class="file-list-column"><div class="file-list"><button v-if="directory" class="file-row" @click="load(breadcrumbs.slice(0, -1).join('/'))"><AppIcon name="ArrowLeft" /><span>上级目录</span></button><button v-for="entry in pager.rows.value" :key="entry.path" class="file-row" :class="{ selected: selected?.path === entry.path }" @click="open(entry)"><AppIcon :name="entry.directory ? 'Folder' : 'FileText'" :class="{ 'folder-icon': entry.directory }" /><span>{{ entry.name }}</span><small>{{ entry.directory ? '' : fileSize(entry.size) }}</small><AppIcon v-if="entry.directory" name="ChevronRight" :size="13" /></button><p v-if="!entries.length" class="empty-inline">目录中没有可显示的文件。</p></div><PaginationControls compact :total="pager.total.value" :page="pager.page.value" :size="pager.size.value" @update:page="pager.page.value = $event" @update:size="pager.size.value = $event" /></div>
      <div class="file-preview"><div class="diff-header"><span class="mono">{{ selected?.path || '文本预览' }}</span><button v-if="selected" class="text-button" @click="ws.task('定位文件', () => request('files:open', { projectId: project.id, path: selected!.path }))"><AppIcon name="ExternalLink" :size="13" />在文件夹中显示</button></div><div v-if="!selected" class="diff-empty"><AppIcon name="FileText" :size="30" /><p>选择文件查看内容</p></div><div v-else-if="loading" class="empty-inline">正在读取…</div><pre v-else class="file-content">{{ content }}</pre></div>
    </div>
  </section>
</template>
