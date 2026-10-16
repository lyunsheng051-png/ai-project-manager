<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useWorkspace } from '@/composables/useWorkspace';
import { request } from '@/api/desktop';
const props = defineProps<{ id: string; visible: boolean }>(); const ws = useWorkspace();
const element = ref<HTMLElement>(); let terminal: Terminal; let observer: ResizeObserver; let unsubscribe: (() => void) | undefined;
let frame: number | undefined; let mounted = false; let lastCols = 0; let lastRows = 0;
function fit() {
  if (!props.visible || !element.value?.clientWidth || !element.value?.clientHeight || !terminal) return;
  const dimensions = addon.proposeDimensions(); if (!dimensions) return;
  addon.fit();
  if (lastCols !== terminal.cols || lastRows !== terminal.rows) {
    lastCols = terminal.cols; lastRows = terminal.rows;
    void request('terminal:resize', { id: props.id, cols: terminal.cols, rows: terminal.rows }).catch(() => undefined);
  }
}
function scheduleFit() {
  if (!mounted || frame !== undefined) return;
  frame = requestAnimationFrame(() => { frame = undefined; fit(); });
}
const addon = new FitAddon();
watch(() => props.visible, async value => { if (value) { await nextTick(); scheduleFit(); terminal?.focus(); } });
onMounted(() => {
  mounted = true;
  terminal = new Terminal({ cursorBlink: true, fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: 13,
    lineHeight: 1.25, scrollback: 3000, theme: { background: '#152131', foreground: '#d9e3ef', cursor: '#9cbaff',
      black: '#253448', brightBlack: '#7a8da7', red: '#f29090', green: '#83c7a2', yellow: '#e0c085', blue: '#94b9ff', magenta: '#c6a2de', cyan: '#83c2d0', white: '#d9e3ef' } });
  terminal.loadAddon(addon);
  const firstRender = terminal.onRender(() => { scheduleFit(); firstRender.dispose(); });
  terminal.open(element.value!);
  const backlog = ws.terminalData.get(props.id); if (backlog) terminal.write(backlog);
  terminal.onData(data => { void request('terminal:write', { id: props.id, data }).catch(error => ws.notify((error as Error).message, 'error')); });
  unsubscribe = ws.listen(event => {
    if (event.type === 'terminal-data' && event.id === props.id) terminal.write(event.data);
    if (event.type === 'terminal-exit' && event.id === props.id) terminal.write(`\r\n\x1b[90m[终端已退出，代码 ${event.exitCode}]\x1b[0m\r\n`);
  });
  observer = new ResizeObserver(scheduleFit); observer.observe(element.value!); scheduleFit();
  void document.fonts.ready.then(scheduleFit);
});
onBeforeUnmount(() => { mounted = false; if (frame !== undefined) cancelAnimationFrame(frame); unsubscribe?.(); observer?.disconnect(); terminal?.dispose(); });
</script>
<template><div ref="element" class="terminal-canvas" /></template>
