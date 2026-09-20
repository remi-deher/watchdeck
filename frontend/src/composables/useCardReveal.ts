import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef } from 'vue';

/** Carte actuellement revelee, partagee par toutes les instances de `MediaCardShell`. */
const activeCard = ref<symbol | null>(null);

export interface CardReveal {
  revealed: ComputedRef<boolean>;
  reveal: () => void;
  conceal: () => void;
}

/**
 * Revele une carte a la fois.
 *
 * Sans souris, l'overlay et le bouton d'action ne se decouvrent qu'au premier appui :
 * un etat purement local laissait donc s'empiler autant d'affiches ouvertes que
 * d'appuis, jusqu'a ce qu'une grille entiere reste titre et bouton sortis. Le jeton
 * partage fait que reveler une carte referme la precedente, sans que les cartes aient
 * a se connaitre entre elles.
 */
export function useCardReveal(): CardReveal {
  const id = Symbol('media-card');
  const revealed = computed(() => activeCard.value === id);

  function reveal(): void {
    activeCard.value = id;
  }

  function conceal(): void {
    // Ne referme que si le jeton est toujours le notre : une autre carte a pu le
    // reprendre entre-temps (le `mouseenter` de la suivante precede le `mouseleave`
    // de la precedente), et l'effacer aveuglement refermerait la nouvelle.
    if (activeCard.value === id) activeCard.value = null;
  }

  if (getCurrentScope()) onScopeDispose(conceal);

  return { revealed, reveal, conceal };
}
