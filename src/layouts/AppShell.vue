<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';
import PaginationControls from '@/components/common/PaginationControls.vue';
import CloneDialog from '@/components/projects/CloneDialog.vue';
import ProjectIdentity from '@/components/projects/ProjectIdentity.vue';
import { useWorkspace } from '@/composables/useWorkspace';
import { usePagination } from '@/composables/usePagination';
import { useTheme } from '@/composables/useTheme';
import { useSidebar } from '@/composables/useSidebar';
import { request } from '@/api/desktop';
import type { Project } from '@/types';
import { confirmWorkspaceNavigation } from '@/composables/useUnsavedChanges';
const ws = useWorkspace(); const route = useRoute(); const router = useRouter();
const appearance = useTheme();
const sidebar = useSidebar(); const searchInput = ref<HTMLInputElement>();
const search = ref(''); const cloneOpen = ref(false); const favorites = ref(false);
const removingId = ref('');
const filtered = computed(() => ws.projects.value.filter(p => (!favorites.value || p.favorite)
  && `${p.name} ${p.path}`.toLowerCase().includes(search.value.toLowerCase()))
  // 收藏分组内保持原有顺序，打开项目不触发重新排序。
  .sort((a, b) => Number(b.favorite) - Number(a.favorite)));
const pager = usePagination(() => filtered.value);
async function expandSearch() {
  await ws.task('展开项目栏', () => sidebar.setCollapsed(false));
  await nextTick(); searchInput.value?.focus();
}
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
  <div class="app-shell" :class="{ 'sidebar-collapsed': sidebar.collapsed.value }">
    <aside id="project-sidebar" class="sidebar" aria-label="项目导航">
      <div class="sidebar-header"><RouterLink to="/" class="brand" aria-label="项目工作台"><span class="brand-symbol"><AppIcon name="Layers" :size="22" /></span><span><strong>项目工作台</strong><small>LOCAL WORKSPACE</small></span></RouterLink><button class="icon-button sidebar-toggle" :disabled="sidebar.busy.value" :title="sidebar.collapsed.value ? '展开项目栏' : '收起项目栏'" :aria-label="sidebar.collapsed.value ? '展开项目栏' : '收起项目栏'" :aria-expanded="!sidebar.collapsed.value" aria-controls="project-sidebar" @click="ws.task('调整项目栏', sidebar.toggle)"><AppIcon :name="sidebar.collapsed.value ? 'ChevronRight' : 'ChevronLeft'" :size="16" /></button></div>
      <div v-show="!sidebar.collapsed.value" class="sidebar-section-title"><span>工作空间</span><span class="count">{{ ws.projects.value.length }}</span></div>
      <div v-show="!sidebar.collapsed.value" class="sidebar-search"><AppIcon name="Search" :size="15" /><input ref="searchInput" v-model="search" aria-label="搜索项目" placeholder="搜索项目…" /></div>
      <div v-show="!sidebar.collapsed.value" class="sidebar-filters"><button :class="{ active: !favorites }" @click="favorites = false">所有项目</button><button :class="{ active: favorites }" @click="favorites = true"><AppIcon name="Star" :size="12" />收藏</button></div>
      <div v-if="sidebar.collapsed.value" class="sidebar-rail-tools"><button class="icon-button" :class="{ active: search }" :disabled="sidebar.busy.value" :title="search ? `搜索项目：${search}` : '搜索项目'" aria-label="展开并搜索项目" @click="expandSearch"><AppIcon name="Search" :size="16" /></button><button class="icon-button" :class="{ active: favorites }" :aria-pressed="favorites" :title="favorites ? '显示所有项目' : '仅显示收藏项目'" :aria-label="favorites ? '显示所有项目' : '仅显示收藏项目'" @click="favorites = !favorites"><AppIcon name="Star" :size="16" /></button></div>
      <div class="project-list">
        <div v-for="project in pager.rows.value" :key="project.id" class="project-item" :class="{ selected: project.id === ws.activeId.value && route.path === '/' }">
          <button class="project-link" :title="`${project.name}\n${project.path}`" :aria-label="`打开项目：${project.name}`" @click="choose(project.id)"><ProjectIdentity :name="project.name" :path="project.path" /><span class="project-label"><strong>{{ project.name }}</strong><small>{{ project.path }}</small></span></button>
          <div v-show="!sidebar.collapsed.value" class="project-record-actions" role="group" :aria-label="`项目操作：${project.name}`">
            <button class="project-star" :class="{ starred: project.favorite }" :aria-label="project.favorite ? '取消收藏' : '收藏项目'" :title="project.favorite ? '取消收藏' : '收藏项目'" @click="favorite(project.id)"><AppIcon name="Star" :size="13" /></button>
            <button class="project-remove" :aria-label="`移除项目记录：${project.name}`" :title="removingId === project.id ? '正在移除项目记录…' : '移除项目记录，保留磁盘文件'" :disabled="Boolean(removingId)" @click="remove(project)"><AppIcon :name="removingId === project.id ? 'Loader' : 'Trash2'" :size="13" :class="{ spin: removingId === project.id }" /></button>
          </div>
        </div>
        <p v-if="!filtered.length" class="sidebar-empty" :title="search ? '没有匹配的项目' : favorites ? '还没有收藏项目' : '导入你的第一个项目'"><span v-if="sidebar.collapsed.value">—</span><template v-else>{{ search ? '没有匹配的项目' : favorites ? '还没有收藏项目' : '导入你的第一个项目' }}</template></p>
      </div>
      <PaginationControls v-if="!sidebar.collapsed.value && ws.projects.value.length > 10" compact :total="pager.total.value" :page="pager.page.value" :size="pager.size.value" @update:page="pager.page.value = $event" @update:size="pager.size.value = $event" />
      <div v-if="sidebar.collapsed.value && pager.pages.value > 1" class="sidebar-rail-pagination"><span>{{ pager.page.value }}/{{ pager.pages.value }}</span><div><button class="icon-button" :disabled="pager.page.value <= 1" aria-label="上一页项目" title="上一页项目" @click="pager.page.value--"><AppIcon name="ChevronLeft" :size="13" /></button><button class="icon-button" :disabled="pager.page.value >= pager.pages.value" aria-label="下一页项目" title="下一页项目" @click="pager.page.value++"><AppIcon name="ChevronRight" :size="13" /></button></div></div>
      <div class="sidebar-add"><button title="导入本地项目" aria-label="导入本地项目" @click="ws.importProject"><AppIcon name="FolderPlus" /><span class="sidebar-label">导入本地项目</span></button><button title="克隆 Git 仓库" aria-label="克隆 Git 仓库" @click="cloneOpen = true"><AppIcon name="Download" /><span class="sidebar-label">克隆 Git 仓库</span></button></div>
      <div class="sidebar-bottom"><div class="sidebar-utilities"><RouterLink to="/settings" :class="{ active: route.path === '/settings' }" title="设置与运行信息" aria-label="设置与运行信息"><AppIcon name="Settings" /><span class="sidebar-label">设置与运行信息</span></RouterLink><button class="icon-button theme-toggle" :disabled="appearance.busy.value" :title="appearance.isDark.value ? '切换为浅色模式' : '切换为深色模式'" :aria-label="appearance.isDark.value ? '切换为浅色模式' : '切换为深色模式'" @click="ws.task('切换主题', appearance.toggle)"><AppIcon :name="appearance.isDark.value ? 'Sun' : 'Moon'" :size="16" /></button></div><span v-show="!sidebar.collapsed.value" class="local-indicator"><i />本机运行 <span>v{{ ws.version.value }}</span></span></div>
    </aside>
    <main class="main-shell"><slot /></main>
  </div>
  <CloneDialog v-if="cloneOpen" @close="cloneOpen = false" />
</template>
