<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import AppModal from '@/components/common/AppModal.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import PaginationControls from '@/components/common/PaginationControls.vue';
import { usePagination } from '@/composables/usePagination';
import { useWorkspace } from '@/composables/useWorkspace';
import { request } from '@/api/desktop';
import type { GitBranch } from '@/types';
import { changeRepository } from '@/composables/useRepositoryState';
const props = defineProps<{ projectId: string }>(); const emit = defineEmits<{ close: [] }>();
const ws = useWorkspace(); const branches = ref<GitBranch[]>([]); const name = ref(''); const search = ref(''); const busy = ref(false);
const filtered = computed(() => branches.value.filter(b => b.name.toLowerCase().includes(search.value.toLowerCase())));
const pager = usePagination(() => filtered.value);
async function load() { branches.value = await request('git:branches', { projectId: props.projectId }); }
async function act(operation: 'create-branch' | 'switch' | 'merge', target: string) {
  if (operation === 'merge' && !confirm(`将分支“${target}”合并到当前分支？遇到冲突时会保留现场，供你检查。`)) return;
  busy.value = true;
  await ws.task('更新分支', async () => {
    let result = '';
    const changed = await changeRepository(props.projectId, async () => { result = await request(`git:${operation}`, { projectId: props.projectId, name: target }); });
    if (!changed) return;
    ws.notify(result || '分支操作完成'); name.value = ''; await load(); emit('close');
  });
  await ws.refreshGit(); busy.value = false;
}
onMounted(() => ws.task('读取分支', load));
</script>
<template>
  <AppModal icon="GitBranch" title="分支管理" subtitle="切换分支不会自动丢弃或暂存你的修改。" @close="!busy && emit('close')">
    <form class="branch-create" @submit.prevent="act('create-branch', name)"><input v-model="name" required placeholder="新分支名称，例如 feat/project-scan" class="mono" /><button class="button primary" :disabled="busy || !name.trim()"><AppIcon name="Plus" />创建并切换</button></form>
    <div class="search-field"><AppIcon name="Search" /><input v-model="search" placeholder="搜索本地分支" /></div>
    <div class="branch-list"><div v-for="branch in pager.rows.value" :key="branch.name" class="branch-row"><AppIcon name="GitBranch" /><span class="mono">{{ branch.name }}<small>{{ branch.hash }}</small></span><span v-if="branch.current" class="kind-tag">当前</span><div v-else class="button-group"><button class="button small" :disabled="busy" @click="act('switch', branch.name)">切换</button><button class="button small" :disabled="busy" @click="act('merge', branch.name)">合并到当前</button></div></div><p v-if="!branches.length" class="empty-inline">首次提交后可管理分支。</p></div>
    <PaginationControls :total="pager.total.value" :page="pager.page.value" :size="pager.size.value" @update:page="pager.page.value = $event" @update:size="pager.size.value = $event" />
  </AppModal>
</template>
