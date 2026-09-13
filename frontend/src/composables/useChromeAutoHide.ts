import { getCurrentScope, onScopeDispose, readonly, ref, type Ref } from 'vue';

/**
 * Masquage au défilement des surfaces flottantes du shell.
 *
 * La barre du haut savait déjà s'effacer quand on descend et revenir quand on remonte,
 * mais la rangée de sections, elle, restait collée en haut de l'écran — seule, sans la
 * barre au-dessus d'elle à laquelle elle était visuellement rattachée. Sur un téléphone
 * elle mangeait alors 54px en permanence pour un contenu qu'on est justement en train
 * de parcourir.
 *
 * L'état vit donc ici, à l'extérieur des composants : un seul écouteur de défilement
 * pour toute l'application, et deux surfaces qui disparaissent et reviennent ensemble
 * plutôt que de calculer chacune sa propre réponse au même geste.
 */

/** Sous ce seuil on est en haut de page : rien ne se masque. */
const TOP_ZONE_PX = 24;
/** Il faut avoir dépassé cette hauteur pour qu'un masquage soit justifié. */
const HIDE_AFTER_PX = 96;
/** Seuils de mouvement : remonter est plus sensible que descendre, pour que la barre
    revienne au moindre geste vers le haut sans clignoter au moindre tremblement. */
const HIDE_DELTA_PX = 7;
const SHOW_DELTA_PX = -5;

const hidden = ref(false);
/* Raisons de forcer l'affichage : champ de recherche au focus, tiroir de filtres
   ouvert… Tant qu'il en reste une, la barre ne se masque pas. Un ensemble plutôt qu'un
   booléen : deux composants peuvent tenir la barre visible en même temps, et le premier
   à relâcher ne doit pas décider pour l'autre. */
const holds = new Set<string>();
let listeners = 0;
let lastScrollY = 0;

function onScroll(): void {
  const current = Math.max(0, window.scrollY);
  const delta = current - lastScrollY;
  if (current < TOP_ZONE_PX || delta < SHOW_DELTA_PX || holds.size > 0) hidden.value = false;
  else if (delta > HIDE_DELTA_PX && current > HIDE_AFTER_PX) hidden.value = true;
  lastScrollY = current;
}

export interface ChromeAutoHide {
  /** Vrai quand les surfaces flottantes doivent s'effacer. */
  hidden: Readonly<Ref<boolean>>;
  /** Force l'affichage tant que `active` est vrai, sous une clé propre à l'appelant. */
  setHold: (key: string, active: boolean) => void;
  /** Ramène les surfaces à l'écran (navigation, raccourci clavier…). */
  reveal: () => void;
}

export function useChromeAutoHide(): ChromeAutoHide {
  if (typeof window !== 'undefined') {
    if (listeners === 0) {
      lastScrollY = Math.max(0, window.scrollY);
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    listeners += 1;
    if (getCurrentScope()) {
      onScopeDispose(() => {
        listeners -= 1;
        if (listeners === 0) window.removeEventListener('scroll', onScroll);
      });
    }
  }

  function setHold(key: string, active: boolean): void {
    if (active) {
      holds.add(key);
      hidden.value = false;
    } else {
      holds.delete(key);
    }
  }

  function reveal(): void {
    hidden.value = false;
  }

  return { hidden: readonly(hidden), setHold, reveal };
}
