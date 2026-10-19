<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import PaginationControls from '@/components/common/PaginationControls.vue';
import BranchDialog from './BranchDialog.vue';
import ConflictResolver from './ConflictResolver.vue';
import { request } from '@/api/desktop';
import { useWorkspace } from '@/composables/useWorkspace';
import { usePagination } from '@/composables/usePagination';
import { useRepositoryGuard, useRepositoryState } from '@/composables/useRepositoryState';
import { shortDate } from '@/config/display';
import type { Project, GitFile, GitCommit } from '@/types';
import { gitFileTone, gitToneLabels } from '@/config/gitDecorations';
const props = defineProps<{ project: Project }>(); const emit = defineEmits<{ openFiles: [] }>(); const ws = useWorkspace();
const repository = useRepositoryState(props.project.id);
const mode = ref<'changes' | 'history'>('changes'); const checked = ref<string[]>([]); const message = ref('');
const selectedFile = ref<GitFile>(); const selectedStaged = ref(false); const diff = ref(''); const diffLoading = ref(false);
const history = ref<GitCommit[]>([]); const busy = ref(false); const branches = ref(false); const conflictOpen = ref(false); let diffSequence = 0;
let historySequence = 0;
useRepositoryGuard(props.project.id, () => {
  if (busy.value) { ws.notify('Git 操作正在进行，请完成后再切换分支'); return false; }
  return true;
});
const files = computed(() => ws.gitStatus.value?.files || []);
const conflictFiles = computed(() => files.value.filter(file => file.conflict));
const historyPager = usePagination(() => history.value);
const stagedCount = computed(() => files.value.filter(f => f.staged).length);
const selected = computed(() => { const paths = new Set(checked.value); return files.value.filter(f => paths.has(f.path)); });
const diffLines = computed(() => diff.value.split('\n').slice(0, 5000));
watch(files, value => {
  const paths = new Set(value.map(f => f.path)); checked.value = checked.value.filter(p => paths.has(p));
  if (selectedFile.value) {
    const latest = value.find(file => file.path === selectedFile.value?.path);
    if (latest) {
      const wasConflict = selectedFile.value.conflict; selectedFile.value = latest;
      if (wasConflict && !latest.conflict) { conflictOpen.value = false; void showDiff(latest, latest.staged && !latest.unstaged); }
    }
    else { selectedFile.value = undefined; conflictOpen.value = false; diff.value = ''; diffLoading.value = false; diffSequence++; }
  }
});
async function loadHistory() {
  const sequence = ++historySequence;
  const items = await request('git:history', { projectId: props.project.id });
  if (sequence === historySequence) history.value = items;
}
watch(repository.revision, () => {
  checked.value = []; selectedFile.value = undefined; conflictOpen.value = false; diff.value = ''; diffLoading.value = false; diffSequence++;
  history.value = []; historyPager.page.value = 1;
  void ws.task('读取提交历史', loadHistory);
});
async function refresh() { await ws.refreshGit(); if (ws.gitStatus.value?.isRepository) await ws.task('读取提交历史', loadHistory); }
async function showDiff(file: GitFile, staged: boolean) {
  selectedFile.value = file; selectedStaged.value = staged; const sequence = ++diffSequence;
  if (file.conflict) { conflictOpen.value = true; diff.value = ''; diffLoading.value = false; return; }
  conflictOpen.value = false;
  diffLoading.value = true;
  await ws.task('读取差异', async () => {
    const value = await request('git:diff', { projectId: props.project.id, path: file.path, staged });
    if (sequence === diffSequence) diff.value = value;
  });
  if (sequence === diffSequence) diffLoading.value = false;
}
async function mutate(operation: 'stage' | 'unstage' | 'commit' | 'fetch' | 'pull' | 'merge-remote' | 'push' | 'abort') {
  if (busy.value || repository.busy.value) return; busy.value = true;
  await ws.task(`Git ${operation}`, async () => {
    if (operation === 'stage' || operation === 'unstage') {
      const paths = selected.value.filter(f => operation === 'stage' ? f.unstaged : f.staged).flatMap(f => operation === 'unstage' && f.originalPath ? [f.path, f.originalPath] : [f.path]);
      await request(`git:${operation}`, { projectId: props.project.id, paths: [...new Set(paths)] });
      checked.value = [];
    } else if (operation === 'commit') {
      await request('git:commit', { projectId: props.project.id, message: message.value }); message.value = '';
    } else await request(`git:${operation}`, { projectId: props.project.id });
    ws.notify({ stage: '已暂存所选文件', unstage: '已取消所选文件的暂存', commit: '提交完成', fetch: '已获取远端更新', pull: '拉取完成', 'merge-remote': '已合并远端提交', push: '推送完成', abort: '已中止合并' }[operation]);
  });
  await refresh(); if (selectedFile.value) await showDiff(selectedFile.value, selectedStaged.value); busy.value = false;
}
function toggleAll(event: Event) { checked.value = (event.target as HTMLInputElement).checked ? files.value.map(f => f.path) : []; }
function openFirstConflict() { const file = conflictFiles.value[0]; if (file) void showDiff(file, false); }
function closeConflict() { conflictOpen.value = false; }
onMounted(refresh);
</script>
<template>
  <section class="git-panel" :inert="repository.busy.value" :aria-busy="repository.busy.value">
    <div class="git-toolbar">
      <div class="segmented"><button :class="{ active: mode === 'changes' }" :disabled="!ws.gitStatus.value?.isRepository" @click="mode = 'changes'">工作区</button><button :class="{ active: mode === 'history' }" :disabled="!ws.gitStatus.value?.isRepository" @click="mode = 'history'">提交历史</button></div>
      <div class="git-toolbar-actions" role="group" aria-label="Git 操作">
        <button class="git-tool-button git-refresh" :disabled="busy" aria-label="刷新" title="刷新 Git 状态" @click="refresh"><AppIcon name="RefreshCw" :size="14" /></button>
        <button class="git-tool-button git-branches" :disabled="busy || !ws.gitStatus.value?.isRepository" title="管理、切换与合并分支" @click="branches = true"><AppIcon name="GitBranch" :size="14" />分支管理</button>
        <div class="git-sync-actions" role="group" aria-label="远端同步">
          <button class="git-tool-button git-fetch" :disabled="busy || !ws.gitStatus.value?.isRepository" title="获取远端更新，不修改工作区" @click="mutate('fetch')"><AppIcon name="Download" :size="14" />获取</button>
          <button class="git-tool-button git-pull" :disabled="busy || !ws.gitStatus.value?.isRepository" title="拉取远端提交，仅允许快进；分叉时请使用合并远端" @click="mutate('pull')"><AppIcon name="ArrowDown" :size="14" />拉取</button>
          <button class="git-tool-button git-merge-remote" :disabled="busy || !ws.gitStatus.value?.isRepository || !ws.gitStatus.value?.upstream" title="获取远端并合并当前分支的上游提交，冲突时保留现场" @click="mutate('merge-remote')"><AppIcon name="GitMerge" :size="14" />合并远端</button>
          <button class="git-tool-button git-push" :disabled="busy || !ws.gitStatus.value?.isRepository" title="推送本地提交到远端" @click="mutate('push')"><AppIcon name="ArrowUp" :size="14" />推送</button>
        </div>
      </div>
    </div>
    <div v-if="ws.gitError.value" class="error-banner">{{ ws.gitError.value }}</div>
    <div v-else-if="!ws.gitStatus.value?.isRepository" class="empty-card"><AppIcon name="GitBranch" :size="30" /><h3>此目录还不是 Git 仓库</h3><p>可在项目终端中执行 git init，或导入已有仓库。</p><button class="button" @click="ws.newTerminal">打开终端</button></div>
    <template v-else>
      <div v-if="ws.gitStatus.value.merging || conflictFiles.length" class="warning-banner git-conflict-banner"><AppIcon name="CircleAlert" :size="17" /><div class="git-conflict-copy"><strong v-if="conflictFiles.length">发现 {{ conflictFiles.length }} 个冲突文件</strong><strong v-else>合并已准备提交</strong><span v-if="conflictFiles.length">点击左侧冲突文件打开三栏合并，处理后保存并暂存；也可以先打开文件浏览检查项目。</span><span v-else>冲突已处理，请暂存剩余修改并提交合并，完成后再推送。</span></div><div class="button-group"><button v-if="conflictFiles.length" class="button small" :disabled="busy" @click="openFirstConflict">打开三栏合并</button><button v-if="conflictFiles.length" class="button small" :disabled="busy" @click="emit('openFiles')">文件浏览</button><button v-if="ws.gitStatus.value.merging" class="button small" :disabled="busy" @click="mutate('abort')">中止合并</button></div></div>
      <div v-if="mode === 'changes'" class="git-columns">
        <div class="changes-column"><div class="changes-actions"><label><input type="checkbox" :checked="files.length > 0 && selected.length === files.length" :indeterminate="selected.length > 0 && selected.length < files.length" aria-label="选择全部变更文件" @change="toggleAll" />全部</label><span>{{ checked.length }} 项已选</span><div class="staging-actions" role="group" aria-label="暂存操作"><button class="pane-action stage-action" :disabled="busy || !selected.some(f => f.unstaged)" title="暂存所选文件" @click="mutate('stage')"><AppIcon name="Plus" :size="13" />暂存</button><button class="pane-action unstage-action" :disabled="busy || !selected.some(f => f.staged)" title="取消所选文件的暂存" @click="mutate('unstage')"><AppIcon name="Minus" :size="13" />取消暂存</button></div></div>
          <div class="change-list" role="region" aria-label="变更文件列表" tabindex="0"><div v-for="file in files" :key="file.path" class="change-row" :class="[{ selected: selectedFile?.path === file.path }, `git-${gitFileTone(file)}`]"><input v-model="checked" type="checkbox" :value="file.path" :aria-label="`选择 ${file.path}`" /><button :title="`${file.path} · ${gitToneLabels[gitFileTone(file)]}`" @click="showDiff(file, file.staged && !file.unstaged)"><span class="file-status">{{ file.conflict ? '!' : file.index === '?' ? 'U' : file.index.trim() || file.working }}</span><span class="mono" :title="file.path">{{ file.path }}</span><span v-if="file.staged" class="staged-indicator" title="含已暂存修改"><AppIcon name="Check" :size="12" /></span></button></div><div v-if="!files.length" class="clean-state"><AppIcon name="Check" :size="28" /><strong>工作区干净</strong><p>暂时没有需要提交的修改。</p></div></div>
          <form class="commit-form" @submit.prevent="mutate('commit')"><label for="commit-message">提交说明 <span>{{ stagedCount }} 个文件已暂存</span></label><div class="commit-compose"><textarea id="commit-message" v-model="message" rows="2" placeholder="说明这次修改…" /><button class="button primary small" :aria-label="ws.gitStatus.value.merging ? '提交合并' : '提交已暂存修改'" :disabled="busy || (!stagedCount && !ws.gitStatus.value.merging) || !message.trim()"><AppIcon name="GitCommitHorizontal" :size="15" />{{ ws.gitStatus.value.merging ? '合并' : '提交' }}</button></div></form>
        </div>
        <div class="diff-column"><div class="diff-header"><div class="pane-title"><AppIcon name="Files" :size="14" /><span :class="{ mono: selectedFile }" :title="selectedFile?.path">{{ selectedFile?.path || '文件差异' }}</span></div><div v-if="selectedFile && !selectedFile.conflict" class="segmented small"><button :class="{ active: !selectedStaged }" @click="showDiff(selectedFile, false)">工作区</button><button :class="{ active: selectedStaged }" @click="showDiff(selectedFile, true)">已暂存</button></div></div><div v-if="diffLoading" class="empty-inline">读取差异…</div><div v-else-if="selectedFile?.conflict" class="diff-empty conflict-open-hint"><AppIcon name="GitMerge" :size="30" /><strong>冲突文件已在弹窗中打开</strong><p>请在三栏合并窗口中处理冲突。</p><button class="button small" @click="conflictOpen = true">重新打开</button></div><div v-else-if="!selectedFile" class="diff-empty"><AppIcon name="Files" :size="30" /><p>选择左侧文件，查看具体修改。</p></div><pre v-else class="diff-content"><span v-for="(line, index) in diffLines" :key="index" class="diff-line" :class="{ addition: line.startsWith('+') && !line.startsWith('+++'), deletion: line.startsWith('-') && !line.startsWith('---'), hunk: line.startsWith('@@') }">{{ line || ' ' }}
</span></pre></div>
      </div>
      <div v-else class="history-panel"><div class="history-list"><article v-for="commit in historyPager.rows.value" :key="commit.hash" class="commit-row"><span class="commit-node"><AppIcon name="GitCommitHorizontal" :size="18" /></span><div><h3>{{ commit.subject }}</h3><p>{{ commit.author }}<span>·</span>{{ shortDate(commit.date) }}</p></div><code>{{ commit.shortHash }}</code></article><p v-if="!history.length" class="empty-inline">仓库还没有提交记录。</p></div><PaginationControls :total="historyPager.total.value" :page="historyPager.page.value" :size="historyPager.size.value" @update:page="historyPager.page.value = $event" @update:size="historyPager.size.value = $event" /></div>
    </template>
    <BranchDialog v-if="branches" :project-id="project.id" @close="branches = false; refresh()" />
    <div v-if="conflictOpen && selectedFile?.conflict" class="conflict-modal-backdrop" role="presentation" @click.self="closeConflict">
      <section class="conflict-modal-shell" role="dialog" aria-modal="true" :aria-label="'合并冲突：' + selectedFile.path">
        <header class="conflict-modal-header">
          <div class="conflict-modal-heading"><AppIcon name="GitMerge" :size="17" /><div><strong>{{ selectedFile.path }}</strong><span>Git 三栏冲突合并</span></div></div>
          <button class="icon-button" aria-label="关闭冲突合并窗口" title="关闭" @click="closeConflict"><AppIcon name="X" :size="17" /></button>
        </header>
        <ConflictResolver :project-id="project.id" :path="selectedFile.path" @saved="refresh" @close="closeConflict" />
      </section>
    </div>
  </section>
</template>
