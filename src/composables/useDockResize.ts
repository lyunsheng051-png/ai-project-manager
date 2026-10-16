import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

const STORAGE_KEY = 'output-dock-height';
const MIN_HEIGHT = 160;
const defaultHeight = () => window.innerHeight <= 800 ? 180 : 220;
function storedHeight() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value >= MIN_HEIGHT ? value : defaultHeight();
  } catch { return defaultHeight(); }
}

export function useDockResize(dock: Ref<HTMLElement | undefined>, open: Ref<boolean>) {
  const preferredHeight = ref(storedHeight());
  const maxHeight = ref(Math.max(MIN_HEIGHT, window.innerHeight - 300));
  const height = computed(() => Math.round(Math.min(maxHeight.value, Math.max(MIN_HEIGHT, preferredHeight.value))));
  const dragging = ref(false);
  let pointer: { id: number; element: HTMLElement; y: number; height: number } | undefined;
  let observer: ResizeObserver | undefined;

  function measure() {
    const element = dock.value;
    const content = element?.previousElementSibling;
    const parent = element?.parentElement;
    if (!element || !parent || !(content instanceof HTMLElement)) return;
    const minimumContent = Number.parseFloat(getComputedStyle(content).minHeight) || 100;
    let spaceBelow = 0;
    for (let sibling = element.nextElementSibling; sibling; sibling = sibling.nextElementSibling) spaceBelow += sibling.getBoundingClientRect().height;
    maxHeight.value = Math.max(MIN_HEIGHT, Math.floor(parent.getBoundingClientRect().bottom - spaceBelow - content.getBoundingClientRect().top - minimumContent));
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, String(preferredHeight.value)); } catch { /* 受限存储不影响拖动 */ } }
  function finish() {
    const previous = pointer; pointer = undefined;
    dragging.value = false; document.documentElement.classList.remove('resizing-output-dock');
    if (previous?.element.hasPointerCapture(previous.id)) previous.element.releasePointerCapture(previous.id);
    if (previous) save();
  }
  function start(event: PointerEvent) {
    if (!open.value || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); measure();
    const element = event.currentTarget as HTMLElement;
    pointer = { id: event.pointerId, element, y: event.clientY, height: height.value };
    element.focus({ preventScroll: true }); element.setPointerCapture(event.pointerId);
    dragging.value = true; document.documentElement.classList.add('resizing-output-dock');
  }
  function move(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    preferredHeight.value = Math.min(maxHeight.value, Math.max(MIN_HEIGHT, pointer.height + pointer.y - event.clientY));
  }
  function reset() { measure(); preferredHeight.value = defaultHeight(); save(); }
  function keydown(event: KeyboardEvent) {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); measure();
    preferredHeight.value = event.key === 'Home' ? MIN_HEIGHT : event.key === 'End' ? maxHeight.value
      : Math.min(maxHeight.value, Math.max(MIN_HEIGHT, height.value + (event.key === 'ArrowUp' ? 32 : -32)));
    save();
  }
  watch(open, async value => { if (!value) finish(); await nextTick(); measure(); });
  onMounted(() => {
    measure(); observer = new ResizeObserver(measure);
    if (dock.value?.parentElement) observer.observe(dock.value.parentElement);
    window.addEventListener('resize', measure); window.addEventListener('blur', finish);
  });
  onBeforeUnmount(() => { finish(); observer?.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('blur', finish); });
  return { height, minHeight: MIN_HEIGHT, maxHeight, dragging, measure, start, move, finish, reset, keydown };
}
