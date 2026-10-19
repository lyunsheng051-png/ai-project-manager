<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppModal from '@/components/common/AppModal.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { request } from '@/api/desktop';
import { useWorkspace } from '@/composables/useWorkspace';
import { fileEntryNameError } from '../../../shared/file-creation';
import type { Project, FileEntry, FileCreationKind } from '@/types';

const props = defineProps<{ project: Project; parentPath: string; kind: FileCreationKind }>();
const emit = defineEmits<{ close: []; created: [entry: FileEntry] }>();
const ws = useWorkspace(); const name = ref(''); const busy = ref(false); const error = ref('');
const title = computed(() => props.kind === 'directory' ? '新建目录' : '新建文件');
const invalid = computed(() => fileEntryNameError(name.value));
const location = computed(() => `${props.project.name}${props.parentPath ? `/${props.parentPath}` : ''}`);
watch(name, () => { error.value = ''; });
async function create() {
  if (busy.value || invalid.value) return;
  busy.value = true; error.value = '';
  try {
    const entry = await request('files:create', { projectId: props.project.id, path: props.parentPath, name: name.value, kind: props.kind });
    ws.notify(`已创建${entry.directory ? '目录' : '文件'} ${entry.name}`);
    emit('created', entry);
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure);
    ws.notify(error.value, 'error');
  } finally { busy.value = false; }
}
</script>
<template>
  <AppModal :icon="kind === 'directory' ? 'FolderPlus' : 'FilePlus'" :title="title" :subtitle="kind === 'directory' ? '在所选位置创建目录。' : '创建空文件后自动打开，编辑内容按 Ctrl+S 保存。'" @close="!busy && emit('close')">
    <form id="new-file-entry-form" class="form-stack" @submit.prevent="create">
      <div class="file-create-location"><AppIcon name="FolderOpen" :size="15" /><span>创建位置</span><code :title="`${project.path}${parentPath ? `/${parentPath}` : ''}`">{{ location }}</code></div>
      <label>{{ kind === 'directory' ? '目录名称' : '文件名称' }}<input v-model="name" required maxlength="255" :disabled="busy" :placeholder="kind === 'directory' ? '例如：components' : '例如：example.ts'" autocomplete="off" spellcheck="false" :aria-invalid="Boolean(error || (name && invalid))" aria-describedby="file-create-hint" /></label>
      <p id="file-create-hint" class="form-note" :class="{ 'danger-text': error || (name && invalid) }" role="status">{{ error || (name && invalid) || '只输入名称；在当前目录内创建，同名文件或目录不会被覆盖。' }}</p>
    </form>
    <template #footer><button class="button" :disabled="busy" @click="emit('close')">取消</button><button class="button primary" form="new-file-entry-form" :disabled="busy || Boolean(invalid)"><AppIcon :name="busy ? 'Loader' : kind === 'directory' ? 'FolderPlus' : 'FilePlus'" :size="15" :class="{ spin: busy }" />{{ busy ? '正在创建…' : '创建' }}</button></template>
  </AppModal>
</template>
