<script setup lang="ts">
import { ref } from 'vue';
import AppModal from '@/components/common/AppModal.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import type { FileCopyConflict } from '@/types';
defineProps<{ location: string; conflicts: string[]; total: number }>();
const emit = defineEmits<{ close: []; confirm: [value: FileCopyConflict] }>();
const choice = ref<FileCopyConflict>('rename');
</script>
<template>
  <AppModal icon="Files" tone="warning" title="目标位置存在同名项" :subtitle="`将 ${total} 项复制到 ${location}`" @close="emit('close')">
    <div class="file-copy-conflicts"><div v-for="(name, index) in conflicts" :key="`${name}-${index}`"><AppIcon name="Files" :size="14" /><span>{{ name }}</span></div></div>
    <div class="file-copy-choices"><label><input v-model="choice" type="radio" value="rename" name="file-copy-conflict" /><span><strong>保留两者</strong><small>自动添加“副本”及序号，保留目标中的原文件和目录。</small></span></label><label><input v-model="choice" type="radio" value="skip" name="file-copy-conflict" /><span><strong>跳过同名项</strong><small>同名目录整体跳过，其余项目正常复制。</small></span></label></div>
    <template #footer><button class="button" @click="emit('close')">取消</button><button class="button primary" @click="emit('confirm', choice)"><AppIcon name="Copy" :size="15" />继续复制</button></template>
  </AppModal>
</template>
