import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';

/**
 * Suit une media query et se nettoie avec la portée appelante.
 *
 * Sert à choisir une *structure* de composant, pas une mise en forme : ce qui relève de
 * l'apparence reste en CSS. AppNav s'en sert pour ne monter qu'une seule navigation à la
 * fois, plutôt que d'en rendre deux dont l'une serait masquée — ce qui dupliquerait son
 * état et ses repères ARIA.
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  if (typeof window === 'undefined' || !window.matchMedia) return matches;

  const media = window.matchMedia(query);
  const update = (event?: MediaQueryListEvent): void => {
    matches.value = event?.matches ?? media.matches;
  };
  update();
  media.addEventListener?.('change', update);
  if (getCurrentScope()) onScopeDispose(() => media.removeEventListener?.('change', update));
  return matches;
}
