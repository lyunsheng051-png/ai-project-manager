<script setup lang="ts">
import AppModal from '@/components/common/AppModal.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import type { FileEntry } from '@/types';
defineProps<{ entries: FileEntry[]; dirtyNames: string[]; busy: boolean; progress: number; error: string }>();
const emit = defineEmits<{ close: []; confirm: [] }>();
</script>
<template>
  <AppModal icon="Trash2" tone="danger" :title="entries.length > 1 ? `删除选中的 ${entries.length} 项` : entries[0]?.directory ? '删除目录' : '删除文件'" subtitle="移入系统回收站，可从回收站恢复。" @close="!busy && emit('close')">
    <div class="file-delete-targets"><div v-for="entry in entries" :key="entry.path" class="file-delete-target"><AppIcon :name="entry.directory ? 'Folder' : 'FileText'" :size="23" /><div><strong>{{ entry.name }}</strong><code>{{ entry.path }}</code></div></div></div>
    <p class="form-note">所选项会移入回收站，目录内的文件和子目录一并处理，对应的编辑标签也会关闭。</p>
    <div v-if="dirtyNames.length" class="file-delete-warning"><p>以下文件有未保存的编辑，确认删除会放弃这些编辑：</p><ul><li v-for="name in dirtyNames" :key="name">{{ name }}</li></ul></div>
    <p v-if="error" class="form-note danger-text file-delete-error" role="alert">{{ error }}</p>
    <template #footer><button class="button" :disabled="busy" @click="emit('close')">取消</button><button class="button file-delete-confirm" :disabled="busy" @click="emit('confirm')"><AppIcon :name="busy ? 'Loader' : 'Trash2'" :size="15" :class="{ spin: busy }" />{{ busy ? `正在移入回收站 ${progress}/${entries.length}…` : dirtyNames.length ? '删除并放弃未保存编辑' : '移入回收站' }}</button></template>
  </AppModal>
</template>
