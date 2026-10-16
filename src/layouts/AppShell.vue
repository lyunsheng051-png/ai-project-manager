<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';
import PaginationControls from '@/components/common/PaginationControls.vue';
import CloneDialog from '@/components/projects/CloneDialog.vue';
import { useWorkspace } from '@/composables/useWorkspace';
import { usePagination } from '@/composables/usePagination';
import { request } from '@/api/desktop';
const ws = useWorkspace(); const route = useRoute(); const router = useRouter();
const search = ref(''); const cloneOpen = ref(false); const favorites = ref(false);
const filtered = computed(() => ws.projects.value.filter(p => (!favorites.value || p.favorite)
  && `${p.name} ${p.path}`.toLowerCase().includes(search.value.toLowerCase()))
  .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.lastOpened.localeCompare(a.lastOpened)));
const pager = usePagination(() => filtered.value);
async function choose(id: string) { const project = ws.projects.value.find(p => p.id === id); if (project) { await router.push('/'); await ws.activate(project); } }
async function favorite(id: string) { await ws.task('收藏项目', () => request('project:favorite', { projectId: id })); }
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
          <button class="project-star" :class="{ starred: project.favorite }" :aria-label="project.favorite ? '取消收藏' : '收藏项目'" @click="favorite(project.id)"><AppIcon name="Star" :size="13" /></button>
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
