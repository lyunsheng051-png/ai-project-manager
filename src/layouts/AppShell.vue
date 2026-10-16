<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';
import PaginationControls from '@/components/common/PaginationControls.vue';
import CloneDialog from '@/components/projects/CloneDialog.vue';
import { useWorkspace } from '@/composables/useWorkspace';
import { usePagination } from '@/composables/usePagination';
import { request } from '@/api/desktop';
import type { Project } from '@/types';
import { confirmWorkspaceNavigation } from '@/composables/useUnsavedChanges';
const ws = useWorkspace(); const route = useRoute(); const router = useRouter();
const search = ref(''); const cloneOpen = ref(false); const favorites = ref(false);
const removingId = ref('');
const filtered = computed(() => ws.projects.value.filter(p => (!favorites.value || p.favorite)
  && `${p.name} ${p.path}`.toLowerCase().includes(search.value.toLowerCase()))
  .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.lastOpened.localeCompare(a.lastOpened)));
const pager = usePagination(() => filtered.value);
async function choose(id: string) {
  const project = ws.projects.value.find(p => p.id === id);
  if (!project) return;
  if (route.path !== '/' && await router.push('/')) return;
  await ws.activate(project);
}
async function favorite(id: string) { await ws.task('收藏项目', () => request('project:favorite', { projectId: id })); }
async function remove(project: Project) {
  if (project.id === ws.activeId.value && !confirmWorkspaceNavigation()) return;
  if (removingId.value || !confirm(`从工作台移除“${project.name}”？运行中的服务和终端将停止，磁盘文件会保留。`)) return;
  removingId.value = project.id;
  try {
    await ws.task('移除项目', async () => {
      await request('project:remove', { projectId: project.id });
      ws.notify(`已移除项目记录“${project.name}”`);
    });
  } finally { removingId.value = ''; }
}
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand"><span class="brand-symbol"><AppIcon name="Layers" :size="22" /></span><span><strong>项目工作台</strong><small>LOCAL WORKSPACE</small></span></RouterLink>
      <div class="sidebar-section-title"><span>工作空间</span><span class="count">{{ ws.projects.value.length }}</span></div>
      <div class="sidebar-search"><AppIcon name="Search" :size="15" /><input v-model="search" aria-label="搜索项目" placeholder="搜索项目…" /></div>
      <div class="sidebar-filters"><button :class="{ active: !favorites }" @click="favorites = false">所有项目</button><button :class="{ active: favorites }" @click="favorites = true"><AppIcon name="Star" :size="12" />收藏</button></div>
      <div class="project-list">
        <div v-for="project in pager.rows.value" :key="project.id" class="project-item" :class="{ selected: project.id === ws.activeId.value && route.path === '/' }">
          <button class="project-link" :title="project.path" @click="choose(project.id)"><AppIcon name="Folder" :size="18" /><span><strong>{{ project.name }}</strong><small>{{ project.path }}</small></span></button>
          <div class="project-record-actions" role="group" :aria-label="`项目操作：${project.name}`">
            <button class="project-star" :class="{ starred: project.favorite }" :aria-label="project.favorite ? '取消收藏' : '收藏项目'" :title="project.favorite ? '取消收藏' : '收藏项目'" @click="favorite(project.id)"><AppIcon name="Star" :size="13" /></button>
            <button class="project-remove" :aria-label="`移除项目记录：${project.name}`" :title="removingId === project.id ? '正在移除项目记录…' : '移除项目记录，保留磁盘文件'" :disabled="Boolean(removingId)" @click="remove(project)"><AppIcon :name="removingId === project.id ? 'Loader' : 'Trash2'" :size="13" :class="{ spin: removingId === project.id }" /></button>
          </div>
        </div>
        <p v-if="!filtered.length" class="sidebar-empty">{{ search ? '没有匹配的项目' : favorites ? '还没有收藏项目' : '导入你的第一个项目' }}</p>
      </div>
      <PaginationControls v-if="ws.projects.value.length > 10" compact :total="pager.total.value" :page="pager.page.value" :size="pager.size.value" @update:page="pager.page.value = $event" @update:size="pager.size.value = $event" />
      <div class="sidebar-add"><button @click="ws.importProject"><AppIcon name="FolderPlus" />导入本地项目</button><button @click="cloneOpen = true"><AppIcon name="Download" />克隆 Git 仓库</button></div>
      <div class="sidebar-bottom"><RouterLink to="/settings" :class="{ active: route.path === '/settings' }"><AppIcon name="Settings" />设置与运行信息</RouterLink><span class="local-indicator"><i />本机运行 <span>v{{ ws.version.value }}</span></span></div>
    </aside>
    <main class="main-shell"><slot /></main>
  </div>
  <CloneDialog v-if="cloneOpen" @close="cloneOpen = false" />
</template>
