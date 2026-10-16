<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import { pageSizes } from '@/config/display';
import { computed } from 'vue';
const props = defineProps<{ total: number; page: number; size: number; compact?: boolean }>();
const emit = defineEmits<{ 'update:page': [value: number]; 'update:size': [value: number] }>();
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.size)));
</script>
<template>
  <div class="pagination" :class="{ compact }">
    <span v-if="!compact">共 {{ total }} 项</span>
    <select :value="size" aria-label="每页条数" @change="emit('update:size', Number(($event.target as HTMLSelectElement).value))">
      <option v-for="value in pageSizes" :key="value" :value="value">{{ value }} / 页</option>
    </select>
    <span class="page-count">{{ page }} / {{ pages }}</span>
    <button class="icon-button" :disabled="page <= 1" aria-label="上一页" @click="emit('update:page', page - 1)"><AppIcon name="ChevronLeft" :size="14" /></button>
    <button class="icon-button" :disabled="page >= pages" aria-label="下一页" @click="emit('update:page', page + 1)"><AppIcon name="ChevronRight" :size="14" /></button>
  </div>
</template>
