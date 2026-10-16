<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import TerminalPane from './TerminalPane.vue';
import { useWorkspace } from '@/composables/useWorkspace';
import { request } from '@/api/desktop';
import { useDockResize } from '@/composables/useDockResize';
const props = defineProps<{ layoutKey?: string }>();
const ws = useWorkspace(); const output = ref(''); const filter = ref(''); const autoScroll = ref(true); const logElement = ref<HTMLElement>();
const dock = ref<HTMLElement>(); const resize = useDockResize(dock, ws.dockOpen);
watch([ws.activeId, () => props.layoutKey], async () => { await nextTick(); resize.measure(); });
let unsubscribe: (() => void) | undefined; let pending = ''; let flushTimer: ReturnType<typeof setTimeout> | undefined; let generation = 0;
const projectTerminals = computed(() => ws.terminals.value.filter(t => t.projectId === ws.activeId.value));
const visibleOutput = computed(() => {
  const text = output.value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replaceAll('\r', '');
  return filter.value ? text.split('\n').filter(line => line.toLowerCase().includes(filter.value.toLowerCase())).join('\n') : text;
});
async function scroll() { await nextTick(); if (autoScroll.value && logElement.value) logElement.value.scrollTop = logElement.value.scrollHeight; }
watch([ws.activeId, ws.selectedService], async () => {
  const current = ++generation; pending = ''; output.value = ''; filter.value = '';
  if (!ws.activeId.value || !ws.selectedService.value) return;
  const result = await request('service:output', { projectId: ws.activeId.value, serviceId: ws.selectedService.value }).catch(() => '');
  if (current === generation) { output.value = result; await scroll(); }
}, { immediate: true });
watch(visibleOutput, scroll);
async function copy() { try { await navigator.clipboard.writeText(visibleOutput.value); ws.notify('日志已复制'); } catch { ws.notify('无法访问剪贴板，请直接选择日志复制', 'error'); } }
onMounted(() => { unsubscribe = ws.listen(event => {
  if (event.type === 'output' && event.projectId === ws.activeId.value && event.serviceId === ws.selectedService.value) {
    pending += event.data;
    if (!flushTimer) flushTimer = setTimeout(() => { output.value = (output.value + pending).slice(-200_000); pending = ''; flushTimer = undefined; }, 80);
  }
}); });
onBeforeUnmount(() => { unsubscribe?.(); if (flushTimer) clearTimeout(flushTimer); });
</script>
<template>
  <section ref="dock" class="output-dock" :class="{ collapsed: !ws.dockOpen.value, 'is-resizing': resize.dragging.value }" :style="{ height: ws.dockOpen.value ? `${resize.height.value}px` : undefined }" aria-label="输出与终端">
    <div v-if="ws.dockOpen.value" class="dock-resizer" role="separator" aria-orientation="horizontal" aria-label="调整输出面板高度" aria-controls="output-dock-body" :aria-valuemin="resize.minHeight" :aria-valuemax="resize.maxHeight.value" :aria-valuenow="resize.height.value" tabindex="0" title="上下拖动调整高度，双击恢复默认" @pointerdown="resize.start" @pointermove="resize.move" @pointerup="resize.finish" @pointercancel="resize.finish" @lostpointercapture="resize.finish" @keydown="resize.keydown" @dblclick="resize.reset" />
    <header class="dock-header"><div class="dock-tabs"><button :class="{ active: ws.dockTab.value === 'logs' && ws.dockOpen.value }" @click="ws.dockTab.value = 'logs'; ws.dockOpen.value = true"><AppIcon name="Activity" :size="14" />服务日志</button><button :class="{ active: ws.dockTab.value === 'terminal' && ws.dockOpen.value }" @click="ws.dockTab.value = 'terminal'; ws.dockOpen.value = true"><AppIcon name="Terminal" :size="14" />终端 <span>{{ projectTerminals.length || '' }}</span></button></div><div class="dock-tools"><span v-if="!ws.dockOpen.value" class="muted">输出面板已收起</span><button class="icon-button" title="新建项目终端" aria-label="新建项目终端" :disabled="!ws.activeProject.value" @click="ws.newTerminal"><AppIcon name="Plus" /></button><button class="icon-button" :title="ws.dockOpen.value ? '收起输出面板' : '展开输出面板'" aria-label="切换输出面板" @click="ws.dockOpen.value = !ws.dockOpen.value"><AppIcon :name="ws.dockOpen.value ? 'ChevronDown' : 'PanelBottom'" /></button></div></header>
    <div id="output-dock-body" v-show="ws.dockOpen.value" class="dock-body">
      <div v-show="ws.dockTab.value === 'logs'" class="logs-pane"><div class="log-toolbar"><select v-model="ws.selectedService.value" aria-label="选择日志服务"><option value="" disabled>选择服务</option><option v-for="service in ws.activeProject.value?.services || []" :key="service.id" :value="service.id">{{ service.name }}</option></select><div class="log-filter"><AppIcon name="Search" :size="13" /><input v-model="filter" aria-label="筛选日志" placeholder="筛选日志…" /></div><label class="auto-scroll"><input v-model="autoScroll" type="checkbox" />跟随输出</label><button class="icon-button" title="复制日志" aria-label="复制日志" @click="copy"><AppIcon name="Copy" :size="14" /></button><button class="text-button" @click="output = ''; pending = ''">清屏</button></div><pre v-if="visibleOutput" ref="logElement" class="log-content">{{ visibleOutput }}</pre><div v-else class="output-empty"><AppIcon name="Terminal" :size="22" /><span>{{ filter ? '没有匹配的日志' : '启动服务后，日志会显示在这里' }}</span></div></div>
      <div v-show="ws.dockTab.value === 'terminal'" class="terminals-pane"><div v-if="projectTerminals.length" class="terminal-tabbar"><div v-for="terminal in projectTerminals" :key="terminal.id" class="terminal-tab" :class="{ active: terminal.id === ws.selectedTerminal.value }"><button @click="ws.selectedTerminal.value = terminal.id"><AppIcon name="Terminal" :size="12" />{{ terminal.title }}</button><button :aria-label="`关闭 ${terminal.title}`" @click="ws.closeTerminal(terminal.id)"><AppIcon name="X" :size="12" /></button></div></div><div class="terminal-host"><TerminalPane v-for="terminal in ws.terminals.value" v-show="terminal.id === ws.selectedTerminal.value && terminal.projectId === ws.activeId.value" :id="terminal.id" :key="terminal.id" :visible="terminal.id === ws.selectedTerminal.value && terminal.projectId === ws.activeId.value && ws.dockTab.value === 'terminal' && ws.dockOpen.value" /><div v-if="!projectTerminals.length" class="output-empty"><AppIcon name="Terminal" :size="23" /><p>在项目目录中打开一个交互终端</p><button class="button terminal-button" :disabled="!ws.activeProject.value" @click="ws.newTerminal"><AppIcon name="Plus" :size="14" />打开终端</button></div></div></div>
    </div>
  </section>
</template>
