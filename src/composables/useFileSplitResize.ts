import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

const STORAGE_KEY = 'file-tree-width';
const HANDLE_WIDTH = 5;
const MIN_TREE_WIDTH = 180;
const MIN_EDITOR_WIDTH = 280;

function storedWidth(): number | undefined {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value >= MIN_TREE_WIDTH ? value : undefined;
  } catch { return undefined; }
}

export function useFileSplitResize(container: Ref<HTMLElement | undefined>) {
  const preferredWidth = ref(storedWidth());
  const availableWidth = ref(1000);
  const dragging = ref(false);
  const minWidth = computed(() => Math.min(MIN_TREE_WIDTH, Math.max(0, (availableWidth.value - HANDLE_WIDTH) / 2)));
  const maxWidth = computed(() => Math.max(minWidth.value, availableWidth.value - HANDLE_WIDTH - MIN_EDITOR_WIDTH));
  const defaultWidth = () => Math.max(240, availableWidth.value * .26);
  const clamp = (value: number) => Math.min(maxWidth.value, Math.max(minWidth.value, value));
  const width = computed(() => Math.round(clamp(preferredWidth.value ?? defaultWidth())));
  let pointer: { id: number; element: HTMLElement; x: number; width: number } | undefined;
  let observer: ResizeObserver | undefined;

  function measure() {
    const size = container.value?.clientWidth;
    if (size) availableWidth.value = size;
  }
  function save() {
    try {
      if (preferredWidth.value === undefined) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(preferredWidth.value));
    } catch { /* 存储受限时仍可调整宽度 */ }
  }
  function finish() {
    const previous = pointer; pointer = undefined;
    dragging.value = false;
    document.documentElement.classList.remove('resizing-file-split');
    if (previous?.element.hasPointerCapture(previous.id)) previous.element.releasePointerCapture(previous.id);
    if (previous) save();
  }
  function start(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); measure();
    const element = event.currentTarget as HTMLElement;
    pointer = { id: event.pointerId, element, x: event.clientX, width: width.value };
    element.focus({ preventScroll: true }); element.setPointerCapture(event.pointerId);
    dragging.value = true; document.documentElement.classList.add('resizing-file-split');
  }
  function move(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    preferredWidth.value = clamp(pointer.width + event.clientX - pointer.x);
  }
  function reset() { measure(); preferredWidth.value = undefined; save(); }
  function keydown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); measure();
    preferredWidth.value = event.key === 'Home' ? minWidth.value : event.key === 'End' ? maxWidth.value
      : clamp(width.value + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 40 : 16));
    save();
  }
  onMounted(() => {
    measure(); observer = new ResizeObserver(measure);
    if (container.value) observer.observe(container.value);
    window.addEventListener('blur', finish);
  });
  onBeforeUnmount(() => { finish(); observer?.disconnect(); window.removeEventListener('blur', finish); });
  return { width, minWidth, maxWidth, dragging, start, move, finish, reset, keydown };
}
