<script setup lang="ts">
import { onMounted } from 'vue';
import AppShell from '@/layouts/AppShell.vue';
import { useWorkspace } from '@/composables/useWorkspace';
const ws = useWorkspace();
onMounted(ws.initialize);
</script>
<template>
  <AppShell><RouterView /></AppShell>
  <div class="toast-stack" aria-live="polite">
    <button v-for="message in ws.messages.value" :key="message.id" class="toast" :class="message.kind" @click="ws.messages.value = ws.messages.value.filter(m => m.id !== message.id)">
      {{ message.text }}
    </button>
  </div>
</template>
