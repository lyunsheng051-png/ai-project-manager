<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue';
import { useTheme } from '@/composables/useTheme';
import { useWorkspace } from '@/composables/useWorkspace';
const appearance = useTheme(); const ws = useWorkspace();
</script>
<template>
  <section class="settings-card appearance-settings">
    <h2>外观主题</h2>
    <p class="form-note">同步切换编辑器、终端和弹窗，并记住你的选择。</p>
    <div class="theme-options" role="group" aria-label="外观主题">
      <button class="theme-option" :class="{ selected: appearance.theme.value === 'dark' }" :aria-pressed="appearance.theme.value === 'dark'" :disabled="appearance.busy.value" @click="ws.task('切换主题', () => appearance.setTheme('dark'))"><AppIcon name="Moon" :size="18" /><span><strong>深色</strong><small>墨蓝玻璃</small></span><AppIcon v-if="appearance.theme.value === 'dark'" name="Check" :size="15" /></button>
      <button class="theme-option" :class="{ selected: appearance.theme.value === 'light' }" :aria-pressed="appearance.theme.value === 'light'" :disabled="appearance.busy.value" @click="ws.task('切换主题', () => appearance.setTheme('light'))"><AppIcon name="Sun" :size="18" /><span><strong>浅色</strong><small>雾白玻璃</small></span><AppIcon v-if="appearance.theme.value === 'light'" name="Check" :size="15" /></button>
    </div>
  </section>
</template>
