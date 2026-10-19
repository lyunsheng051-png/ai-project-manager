import { EditorView } from '@codemirror/view';

type ScrollSyncGroup = { views: Set<EditorView>; syncing: boolean };
const scrollSyncGroups = new Map<string, ScrollSyncGroup>();

/** Register an editor in a shared group that mirrors vertical and horizontal scrolling. */
export function registerEditorScrollSync(editor: EditorView, groupKey?: string, onScroll?: (position: { top: number; left: number }) => void) {
  if (!groupKey) return () => undefined;
  const group = scrollSyncGroups.get(groupKey) ?? { views: new Set<EditorView>(), syncing: false };
  group.views.add(editor);
  scrollSyncGroups.set(groupKey, group);

  const handleScroll = () => {
    if (group.syncing) return;
    group.syncing = true;
    try {
      const { scrollLeft, scrollTop } = editor.scrollDOM;
      onScroll?.({ top: scrollTop, left: scrollLeft });
      for (const peer of group.views) {
        if (peer === editor) continue;
        if (peer.scrollDOM.scrollLeft !== scrollLeft) peer.scrollDOM.scrollLeft = scrollLeft;
        if (peer.scrollDOM.scrollTop !== scrollTop) peer.scrollDOM.scrollTop = scrollTop;
      }
    } finally {
      group.syncing = false;
    }
  };

  editor.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });
  return () => {
    editor.scrollDOM.removeEventListener('scroll', handleScroll);
    group.views.delete(editor);
    if (!group.views.size) scrollSyncGroups.delete(groupKey);
  };
}
