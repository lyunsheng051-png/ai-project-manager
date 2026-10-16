import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

function createEditorTheme(dark: boolean) { return EditorView.theme({
  '&': { height: '100%', color: 'var(--editor-ink)', backgroundColor: 'var(--editor)', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: "'Cascadia Code', Consolas, monospace", lineHeight: '22px', overflow: 'auto' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--ink)' },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': { backgroundColor: 'var(--editor)', color: 'var(--muted)', borderRight: '1px solid var(--editor-line)' },
  '.cm-gutterElement': { minWidth: '34px', padding: '0 9px', textAlign: 'right' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--editor-active-line)' },
  '.cm-activeLineGutter': { color: 'var(--ink)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ink)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--editor-selection)' },
  '.cm-content ::selection': { backgroundColor: 'var(--editor-selection)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-hover)', outline: '1px solid var(--accent)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--editor-chrome)', color: 'var(--secondary)', border: '1px solid var(--line-strong)' },
}, { dark }); }

export const editorTheme = createEditorTheme(true);
export const editorLightTheme = createEditorTheme(false);

export const editorSyntax = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.bool, tags.null, tags.controlKeyword], color: 'var(--syntax-keyword)' },
  { tag: [tags.string, tags.regexp], color: 'var(--syntax-string)' },
  { tag: tags.number, color: 'var(--syntax-number)' },
  { tag: [tags.typeName, tags.className, tags.standard(tags.typeName)], color: 'var(--syntax-type)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syntax-function)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--syntax-property)' },
  { tag: tags.tagName, color: 'var(--syntax-tag)' },
  { tag: [tags.meta, tags.processingInstruction], color: 'var(--syntax-meta)' },
  { tag: tags.heading, color: 'var(--syntax-keyword)', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, color: 'var(--syntax-type)', textDecoration: 'underline' },
]));
