<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import CloneDialog from '@/components/projects/CloneDialog.vue';
import ServicePanel from '@/components/services/ServicePanel.vue';
import GitPanel from '@/components/git/GitPanel.vue';
import BranchSwitcher from '@/components/git/BranchSwitcher.vue';
import FilePanel from '@/components/files/FilePanel.vue';
import OutputDock from '@/components/terminal/OutputDock.vue';
import { useWorkspace } from '@/composables/useWorkspace';
import { request } from '@/api/desktop';
const ws = useWorkspace(); const tab = ref<'services' | 'git' | 'files'>('services'); const cloneOpen = ref(false);
const desktopMode = Boolean(window.desktop);
const project = computed(() => ws.activeProject.value);
const filesOpened = ref(false);
const tabs = [{ key: 'services', label: '运行服务', icon: 'Layers' }, { key: 'files', label: '文件浏览', icon: 'Folder' }, { key: 'git', label: 'Git 变更', icon: 'GitBranch' }] as const;
watch(ws.activeId, () => { tab.value = 'services'; filesOpened.value = false; });
function selectTab(value: typeof tab.value) { if (value === 'files') filesOpened.value = true; tab.value = value; }
function focus() { if (project.value) void ws.refreshGit(); }
onMounted(() => window.addEventListener('focus', focus)); onBeforeUnmount(() => window.removeEventListener('focus', focus));
</script>
<template>
  <div class="workspace-view">
    <header class="workspace-topbar">
      <template v-if="project">
        <div class="workspace-project"><h1 :title="project.name">{{ project.name }}</h1><BranchSwitcher v-if="ws.gitStatus.value?.isRepository" :key="project.id" :project-id="project.id" :status="ws.gitStatus.value" /><button class="project-path mono" :title="project.path" aria-label="打开项目文件夹" @click="ws.task('打开文件夹', () => request('project:reveal', { projectId: project!.id }))"><AppIcon name="FolderOpen" :size="13" /><span>{{ project.path }}</span></button></div>
      </template>
      <template v-else><span class="breadcrumb-caption"><AppIcon name="Command" :size="14" />本地工作空间</span><span class="topbar-hint"><span class="status-dot running" />{{ desktopMode ? '桌面工作台' : '浏览器预览' }}</span></template>
    </header>
    <div v-if="!ws.ready.value" class="welcome-screen"><AppIcon name="Loader" :size="28" class="spin" /><p>加载工作空间…</p></div>
    <div v-else-if="!project" class="welcome-screen"><div class="welcome-art"><span /><span /><span /><AppIcon name="FolderOpen" :size="44" /></div><div class="eyebrow">YOUR LOCAL WORKSPACE</div><h1>让项目，随时就绪。</h1><p>导入代码仓库，管理服务、终端和 Git。<br />从一个项目开始，保持工作空间简单。</p><div class="welcome-actions"><button class="button primary" @click="ws.importProject"><AppIcon name="FolderPlus" />导入本地项目</button><button class="button" @click="cloneOpen = true"><AppIcon name="Download" />克隆 Git 仓库</button></div><div v-if="!desktopMode" class="preview-note">当前是界面预览。请在项目目录执行 <code>npm run dev</code>，使用桌面文件、Git和终端功能。</div><div class="welcome-footnote"><span><AppIcon name="Layers" />识别多服务</span><span><AppIcon name="Terminal" />项目终端</span><span><AppIcon name="GitBranch" />基础 Git</span></div></div>
    <template v-else>
      <nav class="project-tabs" aria-label="项目功能"><button v-for="item in tabs" :key="item.key" :data-tab="item.key" :class="{ active: tab === item.key }" :aria-current="tab === item.key ? 'page' : undefined" @click="selectTab(item.key)"><AppIcon :name="item.icon" />{{ item.label }}<span v-if="item.key === 'git' && ws.gitStatus.value?.files.length">{{ ws.gitStatus.value.files.length }}</span></button></nav>
      <div class="workspace-content" :class="{ 'git-workspace': tab === 'git', 'file-workspace': tab === 'files' }"><ServicePanel v-if="tab === 'services'" :key="project.id" :project="project" /><GitPanel v-else-if="tab === 'git'" :key="project.id" :project="project" @open-files="selectTab('files')" /><FilePanel v-if="filesOpened" :key="project.id" :project="project" :visible="tab === 'files'" /></div>
    </template>
    <OutputDock :layout-key="tab" />
    <footer class="statusbar"><span v-if="ws.tasks.value.length"><AppIcon name="Loader" :size="12" class="spin" />{{ ws.tasks.value.at(-1) }}…</span><span v-else><AppIcon name="Check" :size="12" />{{ project ? '工作空间已就绪' : '选择项目以开始' }}</span><span v-if="ws.metrics.value" title="Electron 应用各进程工作集合计，可能重复计入共享页；不含项目服务">应用工作集 {{ ws.metrics.value.workingSetMb }} MB<span class="statusbar-divider">·</span>{{ ws.metrics.value.processCount }} 个应用进程</span><span v-else>配置保存在本机</span></footer>
    <CloneDialog v-if="cloneOpen" @close="cloneOpen = false" />
  </div>
</template>
