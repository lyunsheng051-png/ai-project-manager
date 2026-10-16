import { onBeforeUnmount } from 'vue';

const guards = new Set<() => boolean>();
export function confirmWorkspaceNavigation() {
  return [...guards].every(guard => guard());
}
export function useUnsavedChanges(guard: () => boolean) {
  guards.add(guard);
  onBeforeUnmount(() => guards.delete(guard));
}
