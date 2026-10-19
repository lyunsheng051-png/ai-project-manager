<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import CodeEditor from '@/components/files/CodeEditor.vue';
import { request } from '@/api/desktop';
import { useWorkspace } from '@/composables/useWorkspace';
import { normalizeFileText } from '@/composables/useFileTabs';
import type { GitConflictData } from '@/types';

const props = defineProps<{ projectId: string; path: string }>();
const emit = defineEmits<{ saved: []; close: [] }>();
const ws = useWorkspace();
const loading = ref(true); const saving = ref(false); const error = ref('');
const conflict = ref<GitConflictData>(); const diskOriginal = ref(''); const original = ref(''); const result = ref('');
let loadSequence = 0;
interface MergeSnapshot { content: string; resolved: number[]; resolvedDiffKeys: string[] }
const undoStack = ref<MergeSnapshot[]>([]); const redoStack = ref<MergeSnapshot[]>([]);
const lastActionResult = ref<string>(); const actionUndoAvailable = ref(false);

interface ConflictRange {
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  currentLine: number;
  remoteLine: number;
  current: string;
  remote: string;
  currentLines: number;
  remoteLines: number;
  currentPreview: string;
  remotePreview: string;
}
interface VisibleConflictRange extends ConflictRange {
  index: number;
  displayStart: number;
  displayEnd: number;
  displayStartLine: number;
  displayEndLine: number;
}
interface DiffChange {
  side: 'current' | 'remote';
  key: string;
  sourceStart: number;
  sourceEnd: number;
  targetStart: number;
  targetEnd: number;
  sourceStartLine: number;
  targetStartLine: number;
  sourceText: string;
}
function lineAt(value: string, offset: number) { return value.slice(0, offset).split(/\r\n|\n|\r/).length; }
function lineCount(value: string) {
  if (!value) return 0;
  const lines = value.split(/\r\n|\n|\r/);
  return value.endsWith('\n') || value.endsWith('\r') ? lines.length - 1 : lines.length;
}
function preview(value: string) {
  const lines = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const visible = lines.slice(0, 5);
  const text = visible.join('\n').trim();
  if (!text) return '（空内容）';
  return `${text}${lines.length > visible.length ? '\n…' : ''}`;
}
function findConflictRanges(value: string): ConflictRange[] {
  const pattern = /^<<<<<<<[^\r\n]*(?:\r\n|\n|\r)([\s\S]*?)^=======[^\r\n]*(?:\r\n|\n|\r)([\s\S]*?)^>>>>>>>[^\r\n]*(?:(?:\r\n|\n|\r)|$)/gm;
  return [...value.matchAll(pattern)].map(match => {
    const start = match.index ?? 0; const end = start + match[0].length;
    const current = match[1] ?? ''; const remote = match[2] ?? '';
    return { start, end, startLine: lineAt(value, start), endLine: lineAt(value, end), currentLine: 1, remoteLine: 1, current, remote,
      currentLines: lineCount(current), remoteLines: lineCount(remote), currentPreview: preview(current), remotePreview: preview(remote) };
  });
}
function firstNonEmptyLine(value: string) {
  for (const line of value.split(/\r\n|\n|\r/)) if (line.trim()) return line;
  return '';
}
function lastNonEmptyLine(value: string) {
  const lines = value.split(/\r\n|\n|\r/);
  for (let index = lines.length - 1; index >= 0; index--) if (lines[index].trim()) return lines[index];
  return '';
}
function stripConflictMarkers(value: string) {
  const ranges = findConflictRanges(value);
  return ranges.reduceRight((content, range) => `${content.slice(0, range.start)}${range.current || range.remote}${content.slice(range.end)}`, value);
}
const previewText = ref('');
const resolvedHunks = ref(new Set<number>());
const resolvedDiffKeys = ref(new Set<string>());
function locateDisplayRange(range: ConflictRange, cursor: number): { start: number; end: number } {
  const prefix = lastNonEmptyLine(previewText.value.slice(0, range.start));
  const suffix = firstNonEmptyLine(previewText.value.slice(range.end));
  const prefixIndex = prefix ? result.value.indexOf(prefix, cursor) : -1;
  let start = prefixIndex >= 0 ? result.value.indexOf('\n', prefixIndex + prefix.length) + 1 : cursor;
  if (start <= 0) start = prefixIndex >= 0 ? prefixIndex + prefix.length : cursor;
  let end = suffix ? result.value.indexOf(suffix, start) : result.value.length;
  if (end < start) end = -1;
  if (end < 0) {
    const candidate = [range.current, range.remote].find(value => value && result.value.indexOf(value, cursor) >= 0);
    const candidateStart = candidate ? result.value.indexOf(candidate, cursor) : -1;
    if (candidateStart >= 0) return { start: candidateStart, end: candidateStart + candidate.length };
    end = start;
  }
  return { start, end };
}
const locatedHunks = computed<VisibleConflictRange[]>(() => {
  let cursor = 0;
  return findConflictRanges(previewText.value).map((hunk, index) => {
    const display = locateDisplayRange(hunk, cursor); cursor = display.end;
    return { ...hunk, index, displayStart: display.start, displayEnd: display.end,
      displayStartLine: lineAt(result.value, display.start), displayEndLine: lineAt(result.value, display.end) };
  });
});
function sourceLine(source: string, snippet: string) {
  if (!source || !snippet) return 1;
  const offset = source.indexOf(snippet);
  return offset < 0 ? 1 : lineAt(source, offset);
}
function lineOffsets(value: string) {
  const offsets = [0];
  for (let index = 0; index < value.length; index++) if (value[index] === '\n') offsets.push(index + 1);
  if (offsets[offsets.length - 1] !== value.length) offsets.push(value.length);
  return offsets;
}
function buildDiffChanges(sourceValue: string, targetValue: string, side: DiffChange['side']): DiffChange[] {
  const source = normalizeFileText(sourceValue); const target = normalizeFileText(targetValue);
  const sourceLines = source.split('\n'); const targetLines = target.split('\n');
  const sourceCount = sourceLines.length; const targetCount = targetLines.length;
  if (!source && !target) return [];
  const maxCells = 1_500_000;
  const sourceOffsets = lineOffsets(source); const targetOffsets = lineOffsets(target);
  const changes: DiffChange[] = [];
  const addChange = (sourceStartLine: number, sourceEndLine: number, targetStartLine: number, targetEndLine: number) => {
    const sourceStart = sourceOffsets[Math.min(sourceStartLine, sourceOffsets.length - 1)] ?? source.length;
    const sourceEnd = sourceOffsets[Math.min(sourceEndLine, sourceOffsets.length - 1)] ?? source.length;
    const targetStart = targetOffsets[Math.min(targetStartLine, targetOffsets.length - 1)] ?? target.length;
    const targetEnd = targetOffsets[Math.min(targetEndLine, targetOffsets.length - 1)] ?? target.length;
    if (sourceStart === sourceEnd && targetStart === targetEnd) return;
    const sourceText = source.slice(sourceStart, sourceEnd);
    changes.push({ side, key: `${side}:${sourceStart}:${sourceEnd}:${sourceStartLine}:${sourceText}`, sourceStart, sourceEnd, targetStart, targetEnd,
      sourceStartLine: Math.max(1, sourceStartLine + 1), targetStartLine: Math.max(1, targetStartLine + 1), sourceText });
  };
  if (sourceCount * targetCount > maxCells) {
    addChange(0, sourceCount, 0, targetCount); return changes;
  }
  const table = Array.from({ length: sourceCount + 1 }, () => new Uint32Array(targetCount + 1));
  for (let sourceIndex = sourceCount - 1; sourceIndex >= 0; sourceIndex--) {
    for (let targetIndex = targetCount - 1; targetIndex >= 0; targetIndex--) table[sourceIndex][targetIndex] = sourceLines[sourceIndex] === targetLines[targetIndex] ? table[sourceIndex + 1][targetIndex + 1] + 1 : Math.max(table[sourceIndex + 1][targetIndex], table[sourceIndex][targetIndex + 1]);
  }
  let sourceIndex = 0; let targetIndex = 0; let changeSourceStart = -1; let changeTargetStart = -1;
  const flush = () => {
    if (changeSourceStart >= 0) addChange(changeSourceStart, sourceIndex, changeTargetStart, targetIndex);
    changeSourceStart = -1; changeTargetStart = -1;
  };
  while (sourceIndex < sourceCount || targetIndex < targetCount) {
    if (sourceIndex < sourceCount && targetIndex < targetCount && sourceLines[sourceIndex] === targetLines[targetIndex]) { flush(); sourceIndex++; targetIndex++; continue; }
    if (changeSourceStart < 0) { changeSourceStart = sourceIndex; changeTargetStart = targetIndex; }
    if (sourceIndex < sourceCount && (targetIndex >= targetCount || table[sourceIndex + 1][targetIndex] >= table[sourceIndex][targetIndex + 1])) sourceIndex++;
    else targetIndex++;
  }
  flush(); return changes;
}
function changeTouchesHunk(change: DiffChange, hunk: VisibleConflictRange) {
  if (change.targetStart === change.targetEnd) return change.targetStart >= hunk.displayStart && change.targetStart <= hunk.displayEnd;
  if (hunk.displayStart === hunk.displayEnd) return hunk.displayStart >= change.targetStart && hunk.displayStart < change.targetEnd;
  return change.targetStart < hunk.displayEnd && change.targetEnd > hunk.displayStart;
}
function isPendingChange(change: DiffChange) {
  if (resolvedDiffKeys.value.has(change.key)) return false;
  const matchingHunks = locatedHunks.value.filter(hunk => changeTouchesHunk(change, hunk));
  return !matchingHunks.length || matchingHunks.some(hunk => !resolvedHunks.value.has(hunk.index));
}
const currentChanges = computed(() => buildDiffChanges(conflict.value?.current || '', result.value, 'current').filter(isPendingChange));
const remoteChanges = computed(() => buildDiffChanges(conflict.value?.remote || '', result.value, 'remote').filter(isPendingChange));
const pendingChanges = computed(() => [...currentChanges.value, ...remoteChanges.value]);
// 箭头、冲突计数和应用按钮共同使用待处理差异，避免出现没有箭头但仍被阻止应用的状态。
const hunks = computed(() => locatedHunks.value.filter(hunk => !resolvedHunks.value.has(hunk.index)
  && pendingChanges.value.some(change => changeTouchesHunk(change, hunk))));
const visibleHunks = computed(() => hunks.value.map(hunk => ({ ...hunk,
  currentLine: hunk.current ? sourceLine(conflict.value?.current || '', hunk.current) : hunk.displayStartLine,
  remoteLine: hunk.remote ? sourceLine(conflict.value?.remote || '', hunk.remote) : hunk.displayStartLine,
})));
const showDiffRails = computed(() => pendingChanges.value.length > 0);
const activeHunk = ref(0);
const selectedHunk = computed(() => visibleHunks.value[activeHunk.value] || visibleHunks.value[0]);
const allResolved = computed(() => hunks.value.length === 0);
const dirty = computed(() => result.value !== original.value);
const newline = computed(() => result.value.match(/\r\n|\n|\r/)?.[0] ?? '\n');
const scrollSyncGroup = computed(() => `git-conflict:${props.projectId}:${props.path}`);
const scrollTop = ref(0);
function handleEditorScroll(position: { top: number; left: number }) {
  scrollTop.value = position.top;
}
function snapshot(): MergeSnapshot { return { content: result.value, resolved: [...resolvedHunks.value], resolvedDiffKeys: [...resolvedDiffKeys.value] }; }
function restore(snapshotValue: MergeSnapshot) {
  result.value = snapshotValue.content;
  resolvedHunks.value = new Set(snapshotValue.resolved);
  resolvedDiffKeys.value = new Set(snapshotValue.resolvedDiffKeys);
  lastActionResult.value = result.value;
  actionUndoAvailable.value = true;
}
function handleResultInput(value: string) {
  result.value = value;
  actionUndoAvailable.value = value === lastActionResult.value;
  if (value !== lastActionResult.value && redoStack.value.length) redoStack.value = [];
}
function undoMergeAction() {
  const previous = undoStack.value.at(-1); if (!previous) return;
  undoStack.value = undoStack.value.slice(0, -1); redoStack.value = [...redoStack.value, snapshot()]; restore(previous);
}
function redoMergeAction() {
  const next = redoStack.value.at(-1); if (!next) return;
  redoStack.value = redoStack.value.slice(0, -1); undoStack.value = [...undoStack.value, snapshot()]; restore(next);
}
function handleConflictKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const target = event.target instanceof HTMLElement ? event.target : undefined;
  if (target?.closest('.conflict-current-pane, .conflict-remote-pane')) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey && actionUndoAvailable.value && undoStack.value.length) {
    event.preventDefault(); event.stopPropagation(); undoMergeAction();
  } else if ((key === 'y' || (key === 'z' && event.shiftKey)) && redoStack.value.length) {
    event.preventDefault(); event.stopPropagation(); redoMergeAction();
  }
}

watch(() => hunks.value.length, count => {
  if (!count) activeHunk.value = 0;
  else if (activeHunk.value >= count) activeHunk.value = count - 1;
});

async function load() {
  const sequence = ++loadSequence; loading.value = true; error.value = '';
  try {
    const value = await request('git:conflict', { projectId: props.projectId, path: props.path });
    if (sequence !== loadSequence) return;
    conflict.value = value; diskOriginal.value = value.result;
    previewText.value = normalizeFileText(value.mergePreview || value.result);
    const display = stripConflictMarkers(normalizeFileText(value.result));
    original.value = display; result.value = display; resolvedHunks.value = new Set(); resolvedDiffKeys.value = new Set(); undoStack.value = []; redoStack.value = []; lastActionResult.value = undefined; actionUndoAvailable.value = false;
  } catch (failure) {
    if (sequence === loadSequence) error.value = failure instanceof Error ? failure.message : String(failure);
  } finally { if (sequence === loadSequence) loading.value = false; }
}
function bothSides(current: string, remote: string) {
  if (!current) return remote;
  if (!remote) return current;
  const separator = current.endsWith('\n') || current.endsWith('\r') ? '' : newline.value;
  return `${current}${separator}${remote}`;
}
function applyChoice(index: number, choice: 'current' | 'remote' | 'both' | 'empty') {
  const range = hunks.value[index]; if (!range) return;
  const replacement = choice === 'current' ? range.current : choice === 'remote' ? range.remote : choice === 'both' ? bothSides(range.current, range.remote) : '';
  undoStack.value = [...undoStack.value, snapshot()]; redoStack.value = [];
  result.value = `${result.value.slice(0, range.displayStart)}${replacement}${result.value.slice(range.displayEnd)}`;
  resolvedHunks.value = new Set(resolvedHunks.value).add(range.index);
  lastActionResult.value = result.value; actionUndoAvailable.value = true;
  const remaining = hunks.value.length;
  activeHunk.value = remaining ? Math.min(index, remaining - 1) : 0;
}
function applyDiffChange(side: DiffChange['side'], index: number, remove = false) {
  const change = (side === 'current' ? currentChanges.value : remoteChanges.value)[index]; if (!change) return;
  undoStack.value = [...undoStack.value, snapshot()]; redoStack.value = [];
  resolvedDiffKeys.value = new Set(resolvedDiffKeys.value).add(change.key);
  // IDEA 的删除箭头表示拒绝这一侧的改动，保留中间结果，而不是删除中间代码。
  if (!remove) result.value = `${result.value.slice(0, change.targetStart)}${change.sourceText}${result.value.slice(change.targetEnd)}`;
  lastActionResult.value = result.value; actionUndoAvailable.value = true;
}
async function save(markResolved = false) {
  const canMarkResolved = markResolved && allResolved.value;
  if ((!dirty.value && !canMarkResolved) || saving.value) return;
  const content = result.value; saving.value = true;
  await ws.task('保存合并结果', async () => {
    const saved = dirty.value || canMarkResolved ? await request('files:save', { projectId: props.projectId, path: props.path, content, original: diskOriginal.value }) : diskOriginal.value;
    diskOriginal.value = saved; original.value = normalizeFileText(saved);
    if (conflict.value) conflict.value = { ...conflict.value, result: content };
    if (canMarkResolved) await request('git:stage', { projectId: props.projectId, paths: [props.path] });
    emit('saved');
    ws.notify(canMarkResolved ? '冲突已处理并完成暂存' : hunks.value.length ? '合并结果已保存，仍有冲突块待处理' : '冲突块已处理，请保存后暂存文件完成合并');
  });
  saving.value = false;
}
function reload() {
  if (dirty.value && !confirm('重新读取会丢弃当前未保存的合并结果，继续吗？')) return;
  void load();
}
function cancel() {
  if (dirty.value && !confirm('关闭会丢弃当前未保存的合并结果，继续吗？')) return;
  emit('close');
}
watch(() => props.path, () => { void load(); });
onMounted(load);
</script>

<template>
  <section class="conflict-resolver" aria-label="Git 三栏冲突合并" @keydown.capture="handleConflictKeydown">
    <div v-if="loading" class="empty-inline">正在读取冲突的本地、远端和合并结果…</div>
    <div v-else-if="error" class="file-read-error"><AppIcon name="CircleAlert" :size="24" /><p>{{ error }}</p><button class="button small" @click="load">重试</button></div>
    <template v-else>
      <div class="conflict-resolver-toolbar">
        <div class="conflict-resolver-title"><AppIcon name="GitMerge" :size="15" /><strong>三栏冲突合并</strong><span>{{ hunks.length ? '逐个处理冲突点' : '冲突已全部处理' }}</span></div>
        <div class="button-group"><button class="pane-action icon-only" :disabled="saving" aria-label="重新读取冲突" title="重新读取冲突" @click="reload"><AppIcon name="RefreshCw" :size="14" /></button><button class="pane-action emphasized" :disabled="saving || (!dirty && !allResolved)" @click="save(allResolved)"><AppIcon name="Save" :size="13" />{{ allResolved ? '保存并标记已解决' : '保存合并结果' }}</button></div>
      </div>
      <div class="conflict-status-strip" :class="{ resolved: allResolved }">
        <span class="conflict-status-icon"><AppIcon :name="allResolved ? 'Check' : 'CircleAlert'" :size="15" /></span>
        <div><strong>{{ allResolved ? '冲突已全部处理' : `还有 ${hunks.length} 个冲突未处理` }}</strong><span>{{ allResolved ? '保存后会自动暂存该文件，完成合并。' : '在下方选择左右版本，结果会直接写入中间编辑区。' }}</span></div>
      </div>
      <template v-if="hunks.length && selectedHunk">
        <div class="conflict-hunk-bar" aria-label="冲突块导航">
          <div class="conflict-hunk-label"><AppIcon name="GitMerge" :size="14" /><span>冲突点</span><small>{{ activeHunk + 1 }} / {{ hunks.length }}</small></div>
          <div class="conflict-hunk-list" role="tablist" aria-label="选择冲突点">
            <button v-for="(hunk, index) in hunks" :key="`${hunk.index}-${hunk.displayStart}`" class="conflict-hunk-tab" :class="{ active: activeHunk === index }" role="tab" :aria-selected="activeHunk === index" @click="activeHunk = index"><strong>冲突 {{ index + 1 }}</strong><small>第 {{ hunk.displayStartLine }} 行</small></button>
          </div>
          <div class="conflict-hunk-stepper"><button class="pane-action icon-only" :disabled="activeHunk <= 0" aria-label="上一个冲突" title="上一个冲突" @click="activeHunk--"><AppIcon name="ChevronLeft" :size="14" /></button><button class="pane-action icon-only" :disabled="activeHunk >= hunks.length - 1" aria-label="下一个冲突" title="下一个冲突" @click="activeHunk++"><AppIcon name="ChevronRight" :size="14" /></button></div>
        </div>
        <div class="conflict-hunk-hint"><span>当前冲突位于第 {{ selectedHunk.displayStartLine }}–{{ selectedHunk.displayEndLine }} 行</span><span>点击代码区中间的箭头，或使用底部按钮处理</span></div>
      </template>
      <div class="conflict-three-way" :class="{ resolved: !showDiffRails }">
        <section class="conflict-code-pane conflict-current-pane"><header><span>当前本地代码</span><div class="conflict-pane-header-actions"><small>{{ conflict?.current ? '左侧版本' : '该侧已删除' }}</small><button v-if="hunks.length" class="conflict-pane-accept current" @click="applyChoice(activeHunk, 'current')">采用左侧</button></div></header><CodeEditor :model-value="conflict?.current || ''" :path="path" :scroll-line="selectedHunk?.currentLine" :scroll-sync-group="scrollSyncGroup" read-only :active="false" @scroll="handleEditorScroll" /></section>
        <div v-if="showDiffRails" class="conflict-merge-rail current-rail" aria-label="采用或拒绝本地改动"><div v-for="(change, index) in currentChanges" :key="'left-' + change.key" class="conflict-merge-action-group" :style="{ top: `${42 + (Math.max(change.sourceStartLine, change.targetStartLine) - 1) * 22 - scrollTop}px` }"><button class="conflict-delete-arrow" aria-label="拒绝本地改动" title="拒绝本地改动，保留中间结果" @click="applyDiffChange('current', index, true)">×</button><button class="conflict-merge-arrow current" :title="'第 ' + Math.max(change.sourceStartLine, change.targetStartLine) + ' 行：采用本地版本'" @click="applyDiffChange('current', index)"><AppIcon name="ChevronRight" :size="11" /><AppIcon name="ChevronRight" :size="11" /></button></div></div>
        <section class="conflict-result-pane"><header><span>冲突合并后的代码</span><small>{{ hunks.length ? '处理冲突块后保存 · Ctrl+Z 撤销' : '可继续编辑' }}</small></header><CodeEditor :model-value="result" :path="path" :dirty="dirty" :scroll-line="selectedHunk?.displayStartLine" :scroll-sync-group="scrollSyncGroup" active @update:model-value="handleResultInput" @save="save" @scroll="handleEditorScroll" /></section>
        <div v-if="showDiffRails" class="conflict-merge-rail remote-rail" aria-label="采用或拒绝远端改动"><div v-for="(change, index) in remoteChanges" :key="'right-' + change.key" class="conflict-merge-action-group" :style="{ top: `${42 + (Math.max(change.sourceStartLine, change.targetStartLine) - 1) * 22 - scrollTop}px` }"><button class="conflict-merge-arrow remote" :title="'第 ' + Math.max(change.sourceStartLine, change.targetStartLine) + ' 行：采用远端版本'" @click="applyDiffChange('remote', index)"><AppIcon name="ChevronLeft" :size="11" /><AppIcon name="ChevronLeft" :size="11" /></button><button class="conflict-delete-arrow" aria-label="拒绝远端改动" title="拒绝远端改动，保留中间结果" @click="applyDiffChange('remote', index, true)">×</button></div></div>
        <section class="conflict-code-pane conflict-remote-pane"><header><span>远端代码</span><div class="conflict-pane-header-actions"><small>{{ conflict?.remote ? '右侧版本' : '该侧已删除' }}</small><button v-if="hunks.length" class="conflict-pane-accept remote" @click="applyChoice(activeHunk, 'remote')">采用右侧</button></div></header><CodeEditor :model-value="conflict?.remote || ''" :path="path" :scroll-line="selectedHunk?.remoteLine" :scroll-sync-group="scrollSyncGroup" read-only :active="false" @scroll="handleEditorScroll" /></section>
      </div>
      <footer class="conflict-resolver-footer">
        <div class="conflict-footer-actions"><button class="conflict-bottom-button current" :disabled="!hunks.length || saving" @click="applyChoice(activeHunk, 'current')"><AppIcon name="ArrowLeft" :size="14" />采用左侧</button><button class="conflict-bottom-button remote" :disabled="!hunks.length || saving" @click="applyChoice(activeHunk, 'remote')">采用右侧<AppIcon name="ChevronRight" :size="14" /></button><button class="conflict-bottom-button neutral" :disabled="!hunks.length || saving" @click="applyChoice(activeHunk, 'both')">两边都保留</button></div>
        <div class="conflict-footer-actions"><button class="conflict-bottom-button neutral" :disabled="saving" @click="cancel">取消</button><button class="conflict-bottom-button apply" :disabled="saving || !allResolved" :title="allResolved ? '保存合并结果并暂存，标记文件冲突已解决' : '请先处理所有冲突块'" @click="save(true)"><AppIcon name="Check" :size="14" />应用更改</button></div>
      </footer>
    </template>
  </section>
</template>
