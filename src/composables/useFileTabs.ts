import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { request } from '@/api/desktop';
import { useWorkspace } from './useWorkspace';
import { useUnsavedChanges } from './useUnsavedChanges';
import { useRepositoryGuard, useRepositoryState } from './useRepositoryState';
import { isImageFile } from '../../shared/file-kinds';
import type { FileDocument, FileEntry } from '@/types';

export const normalizeFileText = (value: string) => value.replace(/\r\n|\r/g, '\n');
export const isDocumentDirty = (document: FileDocument) => document.kind === 'text' && document.draft !== normalizeFileText(document.original);

export function useFileTabs(projectId: string) {
  const ws = useWorkspace(); const documents = ref<FileDocument[]>([]); const activePath = ref('');
  const repository = useRepositoryState(projectId);
  const active = computed(() => documents.value.find(document => document.entry.path === activePath.value));
  let nextId = 0; let disposed = false;
  const pending = computed(() => documents.value.filter(isDocumentDirty));

  function canLeave() {
    if (repository.busy.value) { ws.notify('正在更新分支，请稍候'); return false; }
    if (documents.value.some(document => document.saving)) { ws.notify('正在保存文件，请稍候'); return false; }
    if (!pending.value.length) return true;
    const names = pending.value.slice(0, 3).map(document => `“${document.entry.name}”`).join('、');
    return confirm(`${names}${pending.value.length > 3 ? '等' : ''}共 ${pending.value.length} 个文件尚未保存，是否放弃这些修改？`);
  }
  useUnsavedChanges(canLeave);
  useRepositoryGuard(projectId, () => {
    if (documents.value.some(document => document.saving)) { ws.notify('正在保存文件，请稍后切换分支'); return false; }
    if (pending.value.length) { ws.notify('有未保存的文件编辑，请先按 Ctrl+S 保存，或关闭对应标签后再切换分支'); return false; }
    return true;
  });
  watch(repository.revision, () => {
    for (const document of documents.value) if (!isDocumentDirty(document) && !document.saving) void load(document);
  });
  function affectedDocuments(path: string) {
    const normalize = (value: string) => window.desktop?.platform === 'win32' ? value.toLowerCase() : value;
    const target = normalize(path);
    return documents.value.filter(document => normalize(document.entry.path) === target || normalize(document.entry.path).startsWith(`${target}/`));
  }
  function removePath(path: string) {
    const affected = new Set(affectedDocuments(path));
    const index = documents.value.findIndex(document => document.entry.path === activePath.value);
    for (const document of affected) document.loadId++;
    documents.value = documents.value.filter(document => !affected.has(document));
    if (!documents.value.some(document => document.entry.path === activePath.value)) activePath.value = documents.value[Math.min(Math.max(0, index), documents.value.length - 1)]?.entry.path ?? '';
  }

  async function load(document: FileDocument) {
    const current = ++document.loadId; document.loading = true; document.error = '';
    await ws.task('读取文件', async () => {
      try {
        if (document.kind === 'image') {
          const image = await request('files:image', { projectId, path: document.entry.path });
          if (!disposed && current === document.loadId) document.image = image;
        } else {
          const content = await request('files:read', { projectId, path: document.entry.path });
          if (!disposed && current === document.loadId) { document.original = content; document.draft = normalizeFileText(content); }
        }
      } catch (error) {
        if (!disposed && current === document.loadId) { document.error = (error as Error).message; throw error; }
      } finally { if (!disposed && current === document.loadId) document.loading = false; }
    });
  }
  async function open(entry: FileEntry) {
    if (entry.directory) return;
    const existing = documents.value.find(document => document.entry.path === entry.path);
    activePath.value = entry.path;
    if (existing) return;
    documents.value.push({ id: ++nextId, entry: { ...entry }, kind: isImageFile(entry.name) ? 'image' : 'text', original: '', draft: '', loading: true, saving: false, error: '', loadId: 0 });
    await load(documents.value.at(-1)!);
  }
  function close(document: FileDocument) {
    if (document.saving) { ws.notify('正在保存文件，请稍候'); return; }
    if (isDocumentDirty(document) && !confirm(`“${document.entry.name}”尚未保存，是否放弃修改并关闭？`)) return;
    const index = documents.value.indexOf(document); if (index < 0) return;
    document.loadId++; documents.value.splice(index, 1);
    if (activePath.value === document.entry.path) activePath.value = documents.value[Math.min(index, documents.value.length - 1)]?.entry.path ?? '';
  }
  async function reload(document = active.value) {
    if (!document || document.loading || document.saving) return;
    if (isDocumentDirty(document) && !confirm(`重新读取将放弃“${document.entry.name}”的未保存修改，是否继续？`)) return;
    await load(document);
  }
  async function save(document = active.value) {
    if (repository.busy.value) { ws.notify('正在更新分支，请稍后保存'); return; }
    if (!document || document.kind !== 'text' || document.loading || document.saving || document.error || !isDocumentDirty(document)) return;
    const submitted = document.draft; const original = document.original; document.saving = true;
    try {
      await ws.task('保存文件', async () => {
        const value = await request('files:save', { projectId, path: document.entry.path, original, content: submitted });
        if (disposed) return;
        document.original = value;
        // 保存过程中允许继续输入，新输入保留在草稿中，不随此次保存覆盖。
        if (document.draft === submitted) document.draft = normalizeFileText(value);
        document.entry.size = new TextEncoder().encode(value).length;
        await ws.refreshGit(); ws.notify(`已保存 ${document.entry.name}`);
      });
    } finally { document.saving = false; }
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (pending.value.length || documents.value.some(document => document.saving)) { event.preventDefault(); event.returnValue = ''; }
  }
  onBeforeUnmount(() => { disposed = true; for (const document of documents.value) document.loadId++; });
  return { documents, activePath, active, open, close, reload, save, beforeUnload, affectedDocuments, removePath };
}
