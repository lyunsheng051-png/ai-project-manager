import { computed, nextTick, onBeforeUnmount, reactive } from 'vue';

const revisions = reactive(new Map<string, number>());
const changing = reactive(new Set<string>());
const guards = new Map<string, Set<() => boolean>>();

export function useRepositoryState(projectId: string) {
  return { revision: computed(() => revisions.get(projectId) ?? 0), busy: computed(() => changing.has(projectId)) };
}
export function useRepositoryGuard(projectId: string, guard: () => boolean) {
  const registered = guards.get(projectId) ?? new Set<() => boolean>();
  registered.add(guard); guards.set(projectId, registered);
  onBeforeUnmount(() => { registered.delete(guard); if (!registered.size) guards.delete(projectId); });
}
export async function changeRepository(projectId: string, work: () => Promise<unknown>): Promise<boolean> {
  if (changing.has(projectId) || [...(guards.get(projectId) ?? [])].some(guard => !guard())) return false;
  changing.add(projectId);
  try {
    await nextTick();
    await work();
    revisions.set(projectId, (revisions.get(projectId) ?? 0) + 1);
    await nextTick();
    return true;
  } finally { changing.delete(projectId); }
}
