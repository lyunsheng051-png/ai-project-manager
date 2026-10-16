import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

export const editorTheme = EditorView.theme({
  '&': { height: '100%', color: '#bcbec4', backgroundColor: '#1e1f22', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: "'Cascadia Code', Consolas, monospace", lineHeight: '22px', overflow: 'auto' },
  '.cm-content': { padding: '12px 0', caretColor: '#d6d9df' },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': { backgroundColor: '#2b2d30', color: '#6d737f', borderRight: '1px solid #34363b' },
  '.cm-gutterElement': { minWidth: '34px', padding: '0 9px', textAlign: 'right' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#27292e' },
  '.cm-activeLineGutter': { color: '#c1c6d0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#d6d9df' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#354765' },
  '.cm-content ::selection': { backgroundColor: '#354765' },
  '.cm-matchingBracket': { backgroundColor: '#35465d', outline: '1px solid #56779e' },
  '.cm-foldPlaceholder': { backgroundColor: '#30333a', color: '#9299a5', border: '1px solid #474c57' },
}, { dark: true });

export const editorSyntax = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.comment, color: '#7a7e85', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.bool, tags.null, tags.controlKeyword], color: '#cf8e6d' },
  { tag: [tags.string, tags.regexp], color: '#6aab73' },
  { tag: tags.number, color: '#2aacb8' },
  { tag: [tags.typeName, tags.className, tags.standard(tags.typeName)], color: '#56a8f5' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#ffc66d' },
  { tag: [tags.propertyName, tags.attributeName], color: '#c77dbb' },
  { tag: tags.tagName, color: '#d5b778' },
  { tag: [tags.meta, tags.processingInstruction], color: '#b3ae60' },
  { tag: tags.heading, color: '#cf8e6d', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, color: '#56a8f5', textDecoration: 'underline' },
]));
