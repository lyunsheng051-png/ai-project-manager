<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import AppIcon from './AppIcon.vue';
defineProps<{ title: string; subtitle?: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement>();
const previous = document.activeElement as HTMLElement | null;
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); }
  if (event.key === 'Tab') {
    const controls = [...(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, [tabindex="0"]') ?? [])];
    if (!controls.length) return;
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
  }
}
onMounted(async () => { document.addEventListener('keydown', keydown); await nextTick(); (panel.value?.querySelector<HTMLElement>('input,textarea,select') ?? panel.value?.querySelector<HTMLElement>('button'))?.focus(); });
onBeforeUnmount(() => { document.removeEventListener('keydown', keydown); previous?.focus(); });
</script>
<template>
  <Teleport to="body"><div class="modal-backdrop" @mousedown.self="emit('close')">
    <section ref="panel" class="modal" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title">
      <header><div><h2>{{ title }}</h2><p v-if="subtitle">{{ subtitle }}</p></div><button class="icon-button" aria-label="关闭对话框" @click="emit('close')"><AppIcon name="X" /></button></header>
      <div class="modal-body"><slot /></div><footer v-if="$slots.footer"><slot name="footer" /></footer>
    </section>
  </div></Teleport>
</template>
