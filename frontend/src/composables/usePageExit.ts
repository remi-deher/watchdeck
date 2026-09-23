import { nextTick } from 'vue';
import { animate } from 'motion-v';
import type { Router } from 'vue-router';
import { courbe, duree } from '@/motion/tokens';

/**
 * Passage d'une destination a l'autre.
 *
 * Changer d'onglet substituait une page a l'autre sans transition. Envelopper le
 * `<RouterView>` dans une `<Transition>` de Vue ne fonctionne pas ici -- plusieurs vues
 * ont une racine multiple, que Vue ne sait pas animer.
 *
 * Les transitions de vue du navigateur n'ont pas cette limite : il photographie l'ecran
 * qu'on quitte, laisse la nouvelle page se rendre, puis fond l'une dans l'autre. C'est
 * un vrai fondu enchaine -- les deux pages coexistent un instant -- la ou l'ancienne
 * approche vidait l'ecran avant de le remplir, et laissait un trou entre les deux. Seul
 * le contenu (`#main-content`, nomme `page` dans `_motion.scss`) y participe : la barre
 * laterale, le dock et l'en-tete restent immobiles.
 *
 * Sans support (Firefox < 144, iOS < 18), on retombe sur une sortie breve du conteneur,
 * l'arrivee restant a la charge de la composition echelonnee (`page-motion`).
 */

const CLE_FOND = '__overlayBackground';

function mouvementReduit(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function conteneur(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('main-content');
}

type DemarrerTransition = (maj: () => Promise<void>) => { finished: Promise<void>; skipTransition?: () => void };

/* Seul le WebKit pilote par les tests automatises est ecarte : celui de Playwright plante
   la page au premier fondu. Safari, sur iPhone comme sur Mac, garde le fondu enchaine. */
function webKitAutomatise(): boolean {
  if (typeof navigator === 'undefined' || !navigator.webdriver) return false;
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua);
}

function transitionsDeVue(): DemarrerTransition | null {
  if (typeof document === 'undefined' || webKitAutomatise()) return null;
  const start = (document as unknown as { startViewTransition?: DemarrerTransition }).startViewTransition;
  return typeof start === 'function' ? start.bind(document) : null;
}

export function installerSortieDePage(router: Router): void {
  /* La fiche media se pose par-dessus la page, et se referme en y revenant : dans les
     deux sens, la page de fond ne doit ni s'effacer ni se rejouer. L'ouverture se
     reconnait a l'adresse de depart que porte la navigation ; la fermeture, a ce que
     l'entree qu'on quitte en portait une. */
  let depuisSurface = false;
  let rendue: (() => void) | null = null;

  router.beforeResolve(async (to, from) => {
    if (mouvementReduit()) return true;
    // Rien a faire au premier affichage : il n'y a pas d'ecran a quitter.
    if (!from.name && !from.matched.length) return true;
    // Une meme page qui republie son adresse -- un filtre, une section -- n'est pas un
    // changement d'ecran : l'animer ferait clignoter la page a chaque case cochee.
    if (to.path === from.path) return true;
    if ((to as { state?: Record<string, unknown> }).state?.[CLE_FOND] || depuisSurface) return true;

    const demarrer = transitionsDeVue();
    if (demarrer) {
      // La navigation aboutit DANS la transition : le navigateur a deja photographie
      // l'ancien ecran, et attend que la nouvelle page soit rendue pour les fondre.
      return new Promise<boolean>((aboutir) => {
        let partie = false;
        const naviguer = () => { if (!partie) { partie = true; aboutir(true); } };
        /* La navigation n'attend jamais la transition : si le navigateur ne rappelle pas
           a temps -- transition refusee, onglet en arriere-plan, certaines versions de
           WebKit --, on navigue simplement sans animation. Sans ce filet, la page restait
           figee sur l'ecran qu'on voulait quitter. */
        const filet = setTimeout(naviguer, 250);
        try {
          const transition = demarrer(
            () =>
              new Promise<void>((rendu) => {
                clearTimeout(filet);
                if (partie) { rendu(); return; } // trop tard : la page a deja change
                rendue = rendu;
                naviguer();
                // Une navigation annulee ne doit pas figer l'ecran.
                setTimeout(rendu, 1200);
              }),
          );
          transition.finished.catch(() => {});
        } catch {
          clearTimeout(filet);
          naviguer();
        }
      });
    }

    const cible = conteneur();
    if (!cible) return true;
    try {
      // La sortie est plus courte que l'entree : on ne fait pas attendre quelqu'un
      // devant un ecran qu'il quitte.
      await animate(cible, { opacity: [1, 0], y: [0, -10] }, { duration: duree.eclair, ease: courbe.sortie }).finished;
    } catch {
      // Une sortie interrompue ne doit jamais empecher la navigation d'aboutir.
    }
    return true;
  });

  router.afterEach(async () => {
    depuisSurface = typeof history !== 'undefined' && !!(history.state as Record<string, unknown> | null)?.[CLE_FOND];
    if (rendue) {
      const fin = rendue;
      rendue = null;
      await nextTick();
      fin();
    }
    const cible = conteneur();
    if (!cible) return;
    /* Le conteneur est remis a plat des l'arrivee : sans cela une navigation interrompue
       le laissait a demi efface, et la page suivante s'affichait en transparence. */
    cible.style.opacity = '';
    cible.style.transform = '';
  });
}
