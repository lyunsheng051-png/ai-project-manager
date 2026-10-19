<script setup lang="ts">
import { ref, watch } from 'vue';
import AppModal from '@/components/common/AppModal.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { request } from '@/api/desktop';
import { useWorkspace } from '@/composables/useWorkspace';
const emit = defineEmits<{ close: [] }>();
const ws = useWorkspace(); const url = ref(''); const name = ref(''); const busy = ref(false);
watch(url, value => { name.value = value.trim().split(/[/:]/).at(-1)?.replace(/\.git$/, '') || ''; });
async function clone() {
  busy.value = true;
  await ws.task('克隆仓库', async () => {
    const project = await request('project:clone', { url: url.value, name: name.value });
    if (project) {
      if (!ws.projects.value.some(p => p.id === project.id)) ws.projects.value.push(project);
      await ws.activate(project); ws.notify('仓库已克隆'); emit('close');
    }
  });
  busy.value = false;
}
</script>
<template>
  <AppModal icon="Download" title="克隆 Git 仓库" subtitle="克隆完成后将自动识别项目中的服务。" @close="!busy && emit('close')">
    <form id="clone-form" class="form-stack" @submit.prevent="clone">
      <label>仓库地址<input v-model="url" required placeholder="https://github.com/your-name/project.git" :disabled="busy" /></label>
      <label>本地文件夹名称<input v-model="name" required placeholder="project-name" :disabled="busy" /></label>
      <p class="form-note">下一步选择存放仓库的父文件夹。使用本机 Git 的 SSH 或凭据配置；克隆可能需要一些时间。</p>
    </form>
    <template #footer><button class="button" :disabled="busy" @click="emit('close')">取消</button><button class="button primary" form="clone-form" :disabled="busy || !url.trim() || !name.trim()"><AppIcon :name="busy ? 'Loader' : 'Download'" :class="{ spin: busy }" />{{ busy ? '正在克隆…' : '选择位置并克隆' }}</button></template>
  </AppModal>
</template>
