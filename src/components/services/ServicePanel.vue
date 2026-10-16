<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import PaginationControls from '@/components/common/PaginationControls.vue';
import ServiceDialog from './ServiceDialog.vue';
import type { Project, ServiceProfile } from '@/types';
import { stateLabels, kindLabels } from '@/config/display';
import { usePagination } from '@/composables/usePagination';
import { useWorkspace } from '@/composables/useWorkspace';
import { request } from '@/api/desktop';
const props = defineProps<{ project: Project }>(); const ws = useWorkspace();
const editing = ref<ServiceProfile>(); const dialog = ref(false); const pending = ref(new Set<string>());
const pager = usePagination(() => props.project.services);
const active = computed(() => props.project.services.filter(s => ['starting', 'running', 'ready'].includes(ws.runFor(s.id)?.state || '')).length);
function edit(profile?: ServiceProfile) { editing.value = profile; dialog.value = true; }
async function action(profile: ServiceProfile, operation: 'start' | 'stop') {
  pending.value.add(profile.id);
  ws.selectedService.value = profile.id; ws.dockTab.value = 'logs'; ws.dockOpen.value = true;
  await ws.task(`${operation === 'start' ? '启动' : '停止'} ${profile.name}`, () => request(`service:${operation}`, { projectId: props.project.id, serviceId: profile.id }));
  pending.value.delete(profile.id);
}
async function restart(profile: ServiceProfile) { await action(profile, 'stop'); if (!['running', 'ready', 'starting', 'stopping'].includes(ws.runFor(profile.id)?.state || '')) await action(profile, 'start'); }
async function all(operation: 'start-all' | 'stop-all') {
  await ws.task(operation === 'start-all' ? '组合启动' : '停止全部服务', () => request(`service:${operation}`, { projectId: props.project.id }));
}
async function scan() { await ws.task('扫描服务', async () => { await request('project:scan', { projectId: props.project.id }); ws.notify('扫描完成，已有配置已保留'); }); }
async function remove(profile: ServiceProfile) {
  if (!confirm(`移除“${profile.name}”的运行配置？不会删除任何项目文件。`)) return;
  await ws.task('移除运行配置', () => request('service:delete', { projectId: props.project.id, serviceId: profile.id }));
}
</script>
<template>
  <section class="service-panel">
    <div class="section-heading"><div><h2>运行服务 <span>{{ project.services.length }}</span></h2><p>识别项目中的服务，在这里管理它们的运行。</p></div><div class="button-group"><button class="button" @click="scan"><AppIcon name="RefreshCw" />重新扫描</button><button class="button" @click="edit()"><AppIcon name="Plus" />添加服务</button></div></div>
    <div v-if="project.services.length" class="run-toolbar"><div class="run-summary"><span class="status-dot" :class="{ running: active > 0 }" />{{ active }} / {{ project.services.length }} 个服务运行中</div><div class="button-group"><button class="text-button" :disabled="!active" @click="all('stop-all')"><AppIcon name="Square" :size="13" />停止全部</button><button class="button primary small" :disabled="ws.tasks.value.includes('组合启动')" @click="all('start-all')"><AppIcon name="Play" :size="14" />{{ ws.tasks.value.includes('组合启动') ? '正在组合启动…' : '组合启动' }}</button></div></div>
    <div v-if="!project.services.length" class="empty-card"><span class="empty-symbol"><AppIcon name="Layers" :size="28" /></span><h3>还没有运行配置</h3><p>扫描没有发现常见入口。可以添加自定义命令，管理任意本地服务。</p><button class="button primary" @click="edit()"><AppIcon name="Plus" />添加运行配置</button></div>
    <div class="service-list">
      <article v-for="service in pager.rows.value" :key="service.id" class="service-card" :class="{ 'is-running': ['ready', 'running', 'starting'].includes(ws.runFor(service.id)?.state || '') }">
        <div class="service-rail"><span class="service-symbol" :class="service.kind"><AppIcon :name="service.kind === 'frontend' ? 'Code' : service.kind === 'backend' ? 'Layers' : service.kind === 'java' ? 'Cpu' : 'Terminal'" :size="21" /></span></div>
        <div class="service-info"><div class="service-title"><h3>{{ service.name }}</h3><span class="kind-tag">{{ kindLabels[service.kind] }}</span><span class="run-status" :class="ws.runFor(service.id)?.state || 'stopped'"><i />{{ stateLabels[ws.runFor(service.id)?.state || 'stopped'] }}</span></div><div class="service-command"><span class="mono">{{ service.directory }}</span><span class="command-separator">›</span><code>{{ service.command || '请配置启动命令' }}</code></div><div class="service-meta"><span v-if="ws.runFor(service.id)?.pid" class="mono">PID {{ ws.runFor(service.id)?.pid }}</span><button v-if="service.url" class="link-button mono" @click="ws.task('打开地址', () => request('url:open', { url: service.url }))">{{ service.url }}<AppIcon name="ExternalLink" :size="11" /></button><span v-else>{{ service.evidence }}</span></div><p v-if="ws.runFor(service.id)?.error" class="service-error">{{ ws.runFor(service.id)?.error }}</p></div>
        <div class="service-actions"><button class="button small" @click="ws.selectedService.value = service.id; ws.dockTab.value = 'logs'; ws.dockOpen.value = true">日志</button><button class="icon-button" title="编辑运行配置" aria-label="编辑运行配置" @click="edit(service)"><AppIcon name="Settings" /></button><button class="icon-button" title="移除运行配置" aria-label="移除运行配置" @click="remove(service)"><AppIcon name="Trash2" :size="15" /></button><template v-if="['running', 'ready', 'starting', 'stopping'].includes(ws.runFor(service.id)?.state || '')"><button class="icon-button" title="重启" aria-label="重启服务" :disabled="pending.has(service.id)" @click="restart(service)"><AppIcon name="RotateCw" /></button><button class="button small" :disabled="pending.has(service.id) || ws.runFor(service.id)?.state === 'stopping'" @click="action(service, 'stop')"><AppIcon name="Square" :size="12" />停止</button></template><button v-else class="button small start-button" :disabled="pending.has(service.id) || !service.command" @click="action(service, 'start')"><AppIcon name="Play" :size="13" />启动</button></div>
      </article>
    </div>
    <PaginationControls v-if="project.services.length" :total="pager.total.value" :page="pager.page.value" :size="pager.size.value" @update:page="pager.page.value = $event" @update:size="pager.size.value = $event" />
    <div class="panel-tip"><AppIcon name="CircleAlert" :size="14" /><span>扫描不会安装依赖或执行脚本。请先核对命令；默认复用本机已配置的开发环境。</span></div>
    <ServiceDialog v-if="dialog" :key="editing?.id || 'new'" :project="project" :profile="editing" @close="dialog = false" />
  </section>
</template>
