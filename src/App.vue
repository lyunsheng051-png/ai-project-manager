<script setup lang="ts">
import { onMounted } from 'vue';
import AppShell from '@/layouts/AppShell.vue';
import AppTitleBar from '@/components/common/AppTitleBar.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { useWorkspace } from '@/composables/useWorkspace';
const ws = useWorkspace();
onMounted(ws.initialize);
</script>
<template>
  <div class="app-frame"><AppTitleBar /><AppShell><RouterView /></AppShell></div>
  <div class="toast-stack" aria-live="polite">
    <button v-for="message in ws.messages.value" :key="message.id" class="toast" :class="message.kind" :aria-label="`${message.text}，点击关闭通知`" title="点击关闭通知" @click="ws.messages.value = ws.messages.value.filter(m => m.id !== message.id)">
      <span class="toast-symbol"><AppIcon :name="message.kind === 'error' ? 'CircleAlert' : 'Check'" :size="15" /></span><span class="toast-copy">{{ message.text }}</span><AppIcon name="X" :size="13" class="toast-close" />
    </button>
  </div>
</template>
