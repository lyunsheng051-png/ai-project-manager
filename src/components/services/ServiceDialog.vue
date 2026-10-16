<script setup lang="ts">
import { computed, ref } from 'vue';
import AppModal from '@/components/common/AppModal.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import type { Project, ServiceProfile } from '@/types';
import { kindLabels } from '@/config/display';
import { request } from '@/api/desktop';
import { useWorkspace } from '@/composables/useWorkspace';
const props = defineProps<{ project: Project; profile?: ServiceProfile }>();
const emit = defineEmits<{ close: [] }>(); const ws = useWorkspace(); const busy = ref(false);
const form = ref<ServiceProfile>(props.profile ? JSON.parse(JSON.stringify(props.profile)) : { id: '', name: '', kind: 'task', directory: '.', command: '', url: '', environment: {}, dependsOn: [], evidence: '自定义运行配置' });
const environment = ref(Object.entries(form.value.environment).map(([key, value]) => `${key}=${value}`).join('\n'));
const dependencies = computed(() => props.project.services.filter(s => s.id !== form.value.id));
async function save() {
  busy.value = true;
  await ws.task('保存运行配置', async () => {
    const values: Record<string, string> = {};
    for (const line of environment.value.split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const split = line.indexOf('=');
      if (split < 1) throw new Error('环境变量请按 KEY=VALUE 填写，每行一项');
      values[line.slice(0, split).trim()] = line.slice(split + 1);
    }
    await request('service:save', { projectId: props.project.id, profile: { ...form.value, environment: values } });
    ws.notify('运行配置已保存'); emit('close');
  });
  busy.value = false;
}
</script>
<template>
  <AppModal :title="profile ? '编辑运行配置' : '添加运行配置'" subtitle="运行前核对目录和命令。配置仅保存在本机。" @close="!busy && emit('close')">
    <form id="service-form" class="form-stack" @submit.prevent="save">
      <div class="form-row"><label>服务名称<input v-model="form.name" required maxlength="100" placeholder="例如：管理端前端" /></label><label>服务类型<select v-model="form.kind"><option v-for="(label, value) in kindLabels" :key="value" :value="value">{{ label }}</option></select></label></div>
      <label>工作目录 <span class="muted">相对于项目根目录</span><input v-model="form.directory" required placeholder="web 或 backend，根目录为 ." class="mono" /></label>
      <label>启动命令<input v-model="form.command" required placeholder="npm run dev 或 uv run uvicorn app.main:app --reload" class="mono" /></label>
      <label>就绪地址 <span class="muted">选填</span><input v-model="form.url" placeholder="http://127.0.0.1:5173" class="mono" /></label>
      <p class="form-note">填写地址后会检测端口占用并等待响应；留空时仅确认进程是否在运行。启动前请先在终端安装项目依赖。</p>
      <label>环境变量 <span class="muted">每行 KEY=VALUE，明文保存在本机应用数据目录</span><textarea v-model="environment" rows="3" placeholder="NODE_ENV=development" class="mono" /></label>
      <fieldset v-if="dependencies.length" class="dependency-options"><legend>组合启动时先启动这些服务</legend><label v-for="service in dependencies" :key="service.id"><input v-model="form.dependsOn" type="checkbox" :value="service.id" />{{ service.name }}</label></fieldset>
      <p v-if="profile?.evidence" class="evidence"><AppIcon name="FileText" :size="13" />{{ profile.evidence }}</p>
    </form>
    <template #footer><button class="button" :disabled="busy" @click="emit('close')">取消</button><button class="button primary" form="service-form" :disabled="busy"><AppIcon name="Check" />保存配置</button></template>
  </AppModal>
</template>
