import { computed, ref, watch } from 'vue';
export function usePagination<T>(source: () => T[]) {
  const page = ref(1); const size = ref(10);
  const total = computed(() => source().length);
  const pages = computed(() => Math.max(1, Math.ceil(total.value / size.value)));
  watch([total, size], () => { page.value = Math.min(page.value, pages.value); });
  watch(size, () => { page.value = 1; });
  const rows = computed(() => source().slice((page.value - 1) * size.value, page.value * size.value));
  return { page, size, total, pages, rows };
}
