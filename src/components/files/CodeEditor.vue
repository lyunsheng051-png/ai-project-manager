<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import AppIcon from '@/components/common/AppIcon.vue';
import { codeLanguage } from '@/config/codeLanguages';
import { loadEditorLanguage } from '@/config/editorLanguages';
import { editorSyntax, editorTheme, editorLightTheme } from '@/config/editorTheme';
import { useTheme } from '@/composables/useTheme';
import { registerEditorScrollSync } from '@/composables/useEditorScrollSync';

const props = withDefaults(defineProps<{ modelValue: string; path: string; active?: boolean; dirty?: boolean; lineEnding?: string; readOnly?: boolean; scrollLine?: number; scrollSyncGroup?: string }>(), { active: true, dirty: false, lineEnding: 'LF', readOnly: false });
const emit = defineEmits<{ 'update:modelValue': [value: string]; save: []; scroll: [position: { top: number; left: number }] }>();
const host = ref<HTMLElement>(); const language = computed(() => codeLanguage(props.path));
const lines = ref(1); const cursorLine = ref(1); const cursorColumn = ref(1); const languageError = ref(false);
const languageSlot = new Compartment(); const externalChange = Annotation.define<boolean>();
const appearance = useTheme(); const appearanceSlot = new Compartment();
let view: EditorView | undefined; let languageSequence = 0; let unregisterScrollSync: (() => void) | undefined;

async function configureLanguage() {
  const current = ++languageSequence; languageError.value = false;
  try {
    const extension = await loadEditorLanguage(props.path);
    if (view && current === languageSequence) view.dispatch({ effects: languageSlot.reconfigure(extension) });
  } catch { if (current === languageSequence) languageError.value = true; }
}
function updatePosition(state: EditorState) {
  lines.value = state.doc.lines; const head = state.selection.main.head; const line = state.doc.lineAt(head);
  cursorLine.value = line.number; cursorColumn.value = head - line.from + 1;
}
function revealLine(line?: number) {
  if (!view || !line) return;
  const target = Math.max(1, Math.min(Math.round(line), view.state.doc.lines));
  view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(target).from, { y: 'center' }) });
}
onMounted(() => {
  view = new EditorView({ parent: host.value!, state: EditorState.create({ doc: props.modelValue, extensions: [
    appearanceSlot.of(appearance.isDark.value ? editorTheme : editorLightTheme), editorSyntax, EditorState.readOnly.of(props.readOnly), EditorView.editable.of(!props.readOnly), lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(),
    history(), drawSelection(), dropCursor(), indentOnInput(), bracketMatching(), indentUnit.of('  '),
    languageSlot.of([]), EditorState.tabSize.of(2),
    EditorView.contentAttributes.of({ 'aria-label': '文件内容', spellcheck: 'false' }),
    keymap.of([{ key: 'Mod-s', run: () => { emit('save'); return true; }, preventDefault: true }, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.updateListener.of(update => {
      if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalChange))) emit('update:modelValue', update.state.doc.toString());
      if (update.docChanged || update.selectionSet) updatePosition(update.state);
    }),
  ] }) });
  updatePosition(view.state); void configureLanguage();
  unregisterScrollSync = registerEditorScrollSync(view, props.scrollSyncGroup, position => emit('scroll', position));
  revealLine(props.scrollLine);
  if (props.active) { view.requestMeasure(); view.focus(); }
});
watch(() => props.modelValue, value => {
  if (view && value !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value }, annotations: [externalChange.of(true), Transaction.addToHistory.of(false)] });
});
watch(() => props.path, configureLanguage);
watch(() => props.scrollLine, value => revealLine(value));
watch(() => props.scrollSyncGroup, value => {
  unregisterScrollSync?.();
  unregisterScrollSync = view ? registerEditorScrollSync(view, value, position => emit('scroll', position)) : undefined;
});
watch(appearance.theme, () => { view?.dispatch({ effects: appearanceSlot.reconfigure(appearance.isDark.value ? editorTheme : editorLightTheme) }); });
watch(() => props.active, async active => { if (active) { await nextTick(); view?.requestMeasure(); view?.focus(); } });
onBeforeUnmount(() => { languageSequence++; unregisterScrollSync?.(); unregisterScrollSync = undefined; view?.destroy(); view = undefined; });
</script>
<template>
  <div class="code-editor" :data-language="language.id">
    <div ref="host" class="code-editor-host" />
    <div class="code-editor-status"><span><AppIcon name="Code" :size="12" />{{ language.label }}<span>·</span>{{ lines }} 行<span>·</span>{{ cursorLine }}:{{ cursorColumn }}</span><span>{{ readOnly ? '只读 · 可复制' : languageError ? '语法加载失败 · 可继续编辑' : dirty ? '未保存修改 · Ctrl+S 保存' : `UTF-8 · ${lineEnding} · Ctrl+S 保存` }}</span></div>
  </div>
</template>
