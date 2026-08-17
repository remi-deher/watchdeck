import { onMounted, onUnmounted } from 'vue';

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
  onMounted(() => {
    update();
    window.addEventListener('resize', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update, { passive: true });
    window.visualViewport?.addEventListener('scroll', update, { passive: true });
  });
  onUnmounted(() => {
    window.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('scroll', update);
  });
}
