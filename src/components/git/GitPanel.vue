<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import PaginationControls from '@/components/common/PaginationControls.vue';
import BranchDialog from './BranchDialog.vue';
import { request } from '@/api/desktop';
import { useWorkspace } from '@/composables/useWorkspace';
import { usePagination } from '@/composables/usePagination';
import { shortDate } from '@/config/display';
import type { Project, GitFile, GitCommit } from '@/types';
const props = defineProps<{ project: Project }>(); const ws = useWorkspace();
const mode = ref<'changes' | 'history'>('changes'); const checked = ref<string[]>([]); const message = ref('');
const selectedFile = ref<GitFile>(); const selectedStaged = ref(false); const diff = ref(''); const diffLoading = ref(false);
const history = ref<GitCommit[]>([]); const busy = ref(false); const branches = ref(false); let diffSequence = 0;
const files = computed(() => ws.gitStatus.value?.files || []);
const historyPager = usePagination(() => history.value);
const stagedCount = computed(() => files.value.filter(f => f.staged).length);
const selected = computed(() => { const paths = new Set(checked.value); return files.value.filter(f => paths.has(f.path)); });
const diffLines = computed(() => diff.value.split('\n').slice(0, 5000));
watch(files, value => {
  const paths = new Set(value.map(f => f.path)); checked.value = checked.value.filter(p => paths.has(p));
  if (selectedFile.value && !paths.has(selectedFile.value.path)) { selectedFile.value = undefined; diff.value = ''; diffLoading.value = false; diffSequence++; }
});
async function loadHistory() { history.value = await request('git:history', { projectId: props.project.id }); }
async function refresh() { await ws.refreshGit(); if (ws.gitStatus.value?.isRepository) await ws.task('读取提交历史', loadHistory); }
async function showDiff(file: GitFile, staged: boolean) {
  selectedFile.value = file; selectedStaged.value = staged; const sequence = ++diffSequence; diffLoading.value = true;
  await ws.task('读取差异', async () => {
    const value = await request('git:diff', { projectId: props.project.id, path: file.path, staged });
    if (sequence === diffSequence) diff.value = value;
  });
  if (sequence === diffSequence) diffLoading.value = false;
}
async function mutate(operation: 'stage' | 'unstage' | 'commit' | 'fetch' | 'pull' | 'push' | 'abort') {
  if (busy.value) return; busy.value = true;
  await ws.task(`Git ${operation}`, async () => {
    let output: string;
    if (operation === 'stage' || operation === 'unstage') {
      const paths = selected.value.filter(f => operation === 'stage' ? f.unstaged : f.staged).flatMap(f => operation === 'unstage' && f.originalPath ? [f.path, f.originalPath] : [f.path]);
      output = await request(`git:${operation}`, { projectId: props.project.id, paths: [...new Set(paths)] });
      checked.value = [];
    } else if (operation === 'commit') {
      output = await request('git:commit', { projectId: props.project.id, message: message.value }); message.value = '';
    } else output = await request(`git:${operation}`, { projectId: props.project.id });
    ws.notify(output.trim().slice(0, 600) || 'Git 操作完成');
  });
  await refresh(); if (selectedFile.value) await showDiff(selectedFile.value, selectedStaged.value); busy.value = false;
}
function toggleAll(event: Event) { checked.value = (event.target as HTMLInputElement).checked ? files.value.map(f => f.path) : []; }
onMounted(refresh);
</script>
<template>
  <section class="git-panel">
    <div class="section-heading"><div><h2>代码变更 <span>{{ files.length }}</span></h2><p>检查文件差异，再将选中的修改提交到仓库。</p></div><div class="button-group"><button class="button" :disabled="busy" @click="refresh"><AppIcon name="RefreshCw" />刷新</button><button class="button" :disabled="busy || !ws.gitStatus.value?.isRepository" @click="branches = true"><AppIcon name="GitBranch" />分支管理</button></div></div>
    <div v-if="ws.gitError.value" class="error-banner">{{ ws.gitError.value }}</div>
    <div v-else-if="!ws.gitStatus.value?.isRepository" class="empty-card"><AppIcon name="GitBranch" :size="30" /><h3>此目录还不是 Git 仓库</h3><p>可在项目终端中执行 git init，或导入已有仓库。</p><button class="button" @click="ws.newTerminal">打开终端</button></div>
    <template v-else>
      <div class="git-toolbar"><div class="segmented"><button :class="{ active: mode === 'changes' }" @click="mode = 'changes'">工作区</button><button :class="{ active: mode === 'history' }" @click="mode = 'history'">提交历史</button></div><div class="button-group"><button class="text-button" :disabled="busy" @click="mutate('fetch')">Fetch</button><button class="button small" :disabled="busy" title="仅允许快进，不自动合并或变基" @click="mutate('pull')"><AppIcon name="ArrowDown" :size="13" />拉取</button><button class="button small" :disabled="busy" @click="mutate('push')"><AppIcon name="ArrowUp" :size="13" />推送</button></div></div>
      <div v-if="ws.gitStatus.value.merging" class="warning-banner"><AppIcon name="GitMerge" /><span>合并尚未完成。请处理冲突后暂存并提交，或中止本次合并。</span><button class="button small" :disabled="busy" @click="mutate('abort')">中止合并</button></div>
      <div v-if="mode === 'changes'" class="git-columns">
        <div class="changes-column"><div class="changes-actions"><label><input type="checkbox" :checked="files.length > 0 && selected.length === files.length" :indeterminate="selected.length > 0 && selected.length < files.length" aria-label="选择全部变更文件" @change="toggleAll" />全部</label><span>{{ checked.length }} 项已选</span><button class="text-button" :disabled="busy || !selected.some(f => f.unstaged)" @click="mutate('stage')">暂存</button><button class="text-button" :disabled="busy || !selected.some(f => f.staged)" @click="mutate('unstage')">取消暂存</button></div>
          <div class="change-list" role="region" aria-label="变更文件列表" tabindex="0"><div v-for="file in files" :key="file.path" class="change-row" :class="{ selected: selectedFile?.path === file.path }"><input v-model="checked" type="checkbox" :value="file.path" :aria-label="`选择 ${file.path}`" /><button @click="showDiff(file, file.staged && !file.unstaged)"><span class="file-status" :class="{ conflict: file.conflict }">{{ file.conflict ? '!' : file.index === '?' ? 'U' : file.index.trim() || file.working }}</span><span class="mono" :title="file.path">{{ file.path }}</span><span v-if="file.staged" class="staged-indicator" title="含已暂存修改"><AppIcon name="Check" :size="12" /></span></button></div><div v-if="!files.length" class="clean-state"><AppIcon name="Check" :size="28" /><strong>工作区干净</strong><p>暂时没有需要提交的修改。</p></div></div>
          <form class="commit-form" @submit.prevent="mutate('commit')"><label for="commit-message">提交说明 <span>{{ stagedCount }} 个文件已暂存</span></label><textarea id="commit-message" v-model="message" rows="3" placeholder="描述这次修改的内容和原因…" /><button class="button primary" :disabled="busy || (!stagedCount && !ws.gitStatus.value.merging) || !message.trim()"><AppIcon name="GitCommitHorizontal" />提交{{ ws.gitStatus.value.merging ? '合并' : '已暂存修改' }}</button></form>
        </div>
        <div class="diff-column"><div class="diff-header"><span class="mono">{{ selectedFile?.path || '文件差异' }}</span><div v-if="selectedFile" class="segmented small"><button :class="{ active: !selectedStaged }" @click="showDiff(selectedFile, false)">工作区</button><button :class="{ active: selectedStaged }" @click="showDiff(selectedFile, true)">已暂存</button></div></div><div v-if="diffLoading" class="empty-inline">读取差异…</div><div v-else-if="!selectedFile" class="diff-empty"><AppIcon name="Files" :size="30" /><p>选择左侧文件，查看具体修改。</p></div><pre v-else class="diff-content"><span v-for="(line, index) in diffLines" :key="index" class="diff-line" :class="{ addition: line.startsWith('+') && !line.startsWith('+++'), deletion: line.startsWith('-') && !line.startsWith('---'), hunk: line.startsWith('@@') }">{{ line || ' ' }}
</span></pre></div>
      </div>
      <div v-else class="history-panel"><article v-for="commit in historyPager.rows.value" :key="commit.hash" class="commit-row"><span class="commit-node"><AppIcon name="GitCommitHorizontal" :size="18" /></span><div><h3>{{ commit.subject }}</h3><p>{{ commit.author }}<span>·</span>{{ shortDate(commit.date) }}</p></div><code>{{ commit.shortHash }}</code></article><p v-if="!history.length" class="empty-inline">仓库还没有提交记录。</p><PaginationControls :total="historyPager.total.value" :page="historyPager.page.value" :size="historyPager.size.value" @update:page="historyPager.page.value = $event" @update:size="historyPager.size.value = $event" /></div>
    </template>
    <BranchDialog v-if="branches" :project-id="project.id" @close="branches = false; refresh()" />
  </section>
</template>
