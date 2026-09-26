import type { Router } from 'vue-router';
import { retourNatif } from './useRetourNatif';

/**
 * Passage d'une destination a l'autre : un fondu court a l'arrivee, rien d'autre.
 *
 * Deux approches plus ambitieuses ont ete essayees puis retirees. Une sortie animee avant
 * de naviguer faisait attendre devant l'ecran qu'on quittait ; le fondu enchaine des
 * transitions de vue photographiait la page a chaque navigation, ce qui coutait cher sur
 * iPhone. Ici la navigation a lieu tout de suite, et seule la nouvelle page apparait en
 * fondu -- sur l'opacite seulement, que le navigateur anime sans le fil principal.
 */

const CLE_FOND = '__overlayBackground';
const DUREE_MS = 160;

function mouvementReduit(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function installerSortieDePage(router: Router): void {
  /* La fiche media se pose par-dessus la page, et se referme en y revenant : dans les
     deux sens, la page de fond ne doit pas se rejouer. L'ouverture se reconnait a
     l'adresse de depart que porte l'entree d'historique ; la fermeture, a ce que
     l'entree qu'on quitte en portait une. */
  let depuisSurface = false;

  router.afterEach((to, from, failure) => {
    const surfaceIci = typeof history !== 'undefined'
      && !!(history.state as Record<string, unknown> | null)?.[CLE_FOND];
    const quitteSurface = depuisSurface;
    depuisSurface = surfaceIci;

    // Safari a deja fait glisser l'ecran (geste de bord) : pas de fondu par-dessus.
    if (failure || mouvementReduit() || retourNatif.value) return;
    // Rien a faire au premier affichage : il n'y a pas d'ecran a quitter.
    if (!from.name && !from.matched.length) return;
    // Une meme page qui republie son adresse -- un filtre, une section -- n'est pas un
    // changement d'ecran : l'animer ferait clignoter la page a chaque case cochee.
    if (to.path === from.path || surfaceIci || quitteSurface) return;

    const cible = typeof document !== 'undefined' ? document.getElementById('main-content') : null;
    cible?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: DUREE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  });
}
