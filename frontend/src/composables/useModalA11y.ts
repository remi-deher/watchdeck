import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function focusableChildren(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null
  );
}

/**
 * @param panelRef Ref sur l'élément racine de la modale (aside/div), doit porter tabindex="-1".
 * @param isOpenRef Ref booléenne si le composant reste monté avec un v-if interne ; null si le composant n'est monté que pendant l'ouverture.
 * @param onClose Appelé sur Échap.
 */
export function useModalA11y(
  panelRef: Ref<HTMLElement | null>,
  isOpenRef: Ref<boolean> | null | undefined,
  onClose: () => void
): void {
  let previouslyFocused: HTMLElement | null = null;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.value) return;
    const focusable = focusableChildren(panelRef.value);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function activate() {
    previouslyFocused = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKeydown, true);
    await nextTick();
    const panel = panelRef.value;
    if (!panel) return;
    const target = focusableChildren(panel)[0] || panel;
    target.focus({ preventScroll: true });
  }

  function deactivate() {
    document.removeEventListener('keydown', handleKeydown, true);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus({ preventScroll: true });
    }
    previouslyFocused = null;
  }

  if (isOpenRef) {
    watch(
      isOpenRef,
      (open) => {
        if (open) activate();
        else deactivate();
      },
      { immediate: true }
    );
  } else {
    activate();
  }

  onBeforeUnmount(deactivate);
}
