import type { ObjectDirective } from 'vue';

const cleanup = new WeakMap<HTMLElement, () => void>();

/** Move the material highlight without changing the text or its layout. */
export const vGlassLight: ObjectDirective<HTMLElement> = {
  mounted(element) {
    let frame: number | undefined;
    let x = 0;
    let y = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function move(event: PointerEvent) {
      if (event.pointerType === 'touch' || reducedMotion.matches) return;
      x = event.clientX; y = event.clientY;
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const bounds = element.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        element.style.setProperty('--glass-pointer-x', `${Math.max(0, Math.min(100, (x - bounds.left) / bounds.width * 100))}%`);
        element.style.setProperty('--glass-pointer-y', `${Math.max(0, Math.min(100, (y - bounds.top) / bounds.height * 100))}%`);
      });
    }
    function reset() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      element.style.removeProperty('--glass-pointer-x');
      element.style.removeProperty('--glass-pointer-y');
    }
    element.addEventListener('pointermove', move, { passive: true });
    element.addEventListener('pointerleave', reset);
    cleanup.set(element, () => {
      reset();
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', reset);
    });
  },
  beforeUnmount(element) { cleanup.get(element)?.(); cleanup.delete(element); },
};
