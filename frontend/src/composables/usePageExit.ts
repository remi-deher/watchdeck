import { animate } from 'motion-v';
import type { Router } from 'vue-router';

/**
 * Sortie de page entre deux destinations.
 *
 * Changer d'onglet substituait une page a l'autre sans transition : l'ancien ecran
 * disparaissait, le nouveau etait la. Envelopper le `<RouterView>` dans une
 * `<Transition>` de Vue ne fonctionne pas ici -- plusieurs vues ont une racine multiple,
 * que Vue ne sait pas animer : il avertit, puis laisse la vue sortante superposee a la
 * nouvelle. On anime donc le conteneur, qui lui est unique et stable, et l'arrivee reste
 * a la charge de la composition echelonnee (`page-motion`).
 *
 * La sortie est volontairement plus courte que l'entree : on ne fait pas attendre
 * quelqu'un devant un ecran qu'il quitte.
 */

const DUREE_SORTIE = 0.13;

function mouvementReduit(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function conteneur(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('main-content');
}

export function installerSortieDePage(router: Router): void {
  router.beforeResolve(async (to, from) => {
    if (mouvementReduit()) return true;
    // Rien a faire au premier affichage : il n'y a pas d'ecran a quitter.
    if (!from.name && !from.matched.length) return true;
    // Une meme page qui republie son adresse -- un filtre, une section -- n'est pas un
    // changement d'ecran : l'animer ferait clignoter la page a chaque case cochee.
    if (to.path === from.path) return true;
    /* La fiche media se pose par-dessus la page : celle-ci reste visible dessous et ne
       doit surtout pas s'effacer. On reconnait ce cas a l'adresse de depart que porte la
       navigation. */
    if ((to as { state?: Record<string, unknown> }).state?.__overlayBackground) return true;

    const cible = conteneur();
    if (!cible) return true;
    try {
      await animate(cible, { opacity: [1, 0], y: [0, -10] }, { duration: DUREE_SORTIE, ease: [0.2, 0.8, 0.2, 1] })
        .finished;
    } catch {
      // Une sortie interrompue -- seconde navigation par-dessus -- ne doit jamais
      // empecher la navigation elle-meme d'aboutir.
    }
    return true;
  });

  router.afterEach(() => {
    const cible = conteneur();
    if (!cible) return;
    /* Le conteneur est remis a plat des l'arrivee : sans cela une navigation interrompue
       le laissait a demi efface, et la page suivante s'affichait en transparence. Son
       contenu, lui, se compose tout seul par `page-motion`. */
    cible.style.opacity = '';
    cible.style.transform = '';
  });
}
