import { onMounted } from 'vue';
import { useEventListener } from '@vueuse/core';

const KEYBOARD_THRESHOLD = 120;

export function updateVisualViewport(root: HTMLElement = document.documentElement): void {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  const offsetLeft = viewport?.offsetLeft ?? 0;
  const obscuredBottom = Math.max(0, window.innerHeight - height - offsetTop);
  const keyboardInset = viewport && viewport.scale === 1 && obscuredBottom >= KEYBOARD_THRESHOLD ? obscuredBottom : 0;
  root.style.setProperty('--visual-viewport-height', `${Math.round(height)}px`);
  root.style.setProperty('--visual-viewport-offset-top', `${Math.round(offsetTop)}px`);
  root.style.setProperty('--visual-viewport-offset-left', `${Math.round(offsetLeft)}px`);
  root.style.setProperty('--keyboard-inset', `${Math.round(keyboardInset)}px`);
  root.toggleAttribute('data-keyboard-open', keyboardInset > 0);
}

export function useVisualViewport(): void {
  const update = (): void => updateVisualViewport();
  onMounted(update);
  useEventListener(window, 'resize', update, { passive: true });
  if (typeof window !== 'undefined' && window.visualViewport) {
    useEventListener(window.visualViewport, ['resize', 'scroll'], update, { passive: true });
  }
}
