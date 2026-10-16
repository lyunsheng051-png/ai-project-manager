<script setup lang="ts">
import AppIcon from './AppIcon.vue';
const visible = window.desktop?.platform === 'win32';
</script>
<template>
  <header v-if="visible" class="app-titlebar" aria-label="项目工作台窗口标题栏">
    <AppIcon name="Layers" :size="14" /><span>项目工作台</span>
  </header>
</template>
