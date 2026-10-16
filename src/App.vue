<script setup lang="ts">
import { onMounted } from 'vue';
import AppShell from '@/layouts/AppShell.vue';
import AppTitleBar from '@/components/common/AppTitleBar.vue';
import { useWorkspace } from '@/composables/useWorkspace';
const ws = useWorkspace();
onMounted(ws.initialize);
</script>
<template>
  <div class="app-frame"><AppTitleBar /><AppShell><RouterView /></AppShell></div>
  <div class="toast-stack" aria-live="polite">
    <button v-for="message in ws.messages.value" :key="message.id" class="toast" :class="message.kind" @click="ws.messages.value = ws.messages.value.filter(m => m.id !== message.id)">
      {{ message.text }}
    </button>
  </div>
</template>
