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
const HISTORY_MARKER = '__modalOpen';

export function useModalA11y(
  panelRef: Ref<HTMLElement | null>,
  isOpenRef: Ref<boolean> | null | undefined,
  onClose: () => void
): void {
  let previouslyFocused: HTMLElement | null = null;
  let dismissedByBackButton = false;
  let historyToken: string | null = null;

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

  // Le bouton/geste "retour" du systeme (Android, PWA) declenche un popstate plutot
  // qu'un evenement DOM classique. Sans ce handler, "retour" quitte la page entiere
  // au lieu de simplement fermer la modale ouverte par-dessus.
  function handlePopState() {
    dismissedByBackButton = true;
    onClose();
  }

  async function activate() {
    previouslyFocused = document.activeElement as HTMLElement | null;
    dismissedByBackButton = false;
    historyToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('popstate', handlePopState);
    history.pushState({ ...history.state, [HISTORY_MARKER]: historyToken }, '');
    await nextTick();
    const panel = panelRef.value;
    if (!panel) return;
    const target = focusableChildren(panel)[0] || panel;
    target.focus({ preventScroll: true });
  }

  function deactivate() {
    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('popstate', handlePopState);
    // Fermeture explicite (croix, Echap, clic hors modale) : on consomme nous-memes
    // l'entree d'historique ajoutee a l'ouverture, sinon le premier "retour" de
    // l'utilisateur ne ferait que la re-annuler sans effet visible. On ne le fait
    // que si l'entree courante est bien la notre (jeton exact), pour ne jamais
    // reculer sur une navigation qui a deja eu lieu pour une autre raison.
    if (!dismissedByBackButton && historyToken && history.state?.[HISTORY_MARKER] === historyToken) {
      history.back();
    }
    historyToken = null;
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
