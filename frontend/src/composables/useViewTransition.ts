/**
 * Transitions de vue partagees.
 *
 * Toucher une affiche ouvrait la fiche par substitution : l'ancien ecran disparaissait,
 * le nouveau arrivait, et l'oeil devait le relire entierement pour retrouver le media
 * qu'il suivait. L'API `startViewTransition` transporte l'affiche d'un ecran a l'autre --
 * elle grandit et glisse a sa place dans l'en-tete, et le reste se compose autour d'elle.
 *
 * Amelioration progressive : sans support, ou quand l'utilisateur demande moins
 * d'animation, la navigation se fait comme avant. Rien ne depend de la transition.
 */

/** Nom partage par l'affiche de la grille et celle de la fiche, le temps du passage. */
export const POSTER_TRANSITION_NAME = 'media-poster';

interface ViewTransition {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
};

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function supportsViewTransitions(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof (document as DocumentWithViewTransition).startViewTransition === 'function';
}

/**
 * Execute `navigate` dans une transition de vue quand c'est possible, et tel quel sinon.
 *
 * `element`, s'il est fourni, porte le nom partage pendant toute la duree du passage. On
 * le retire ensuite : deux elements portant le meme nom au meme instant annulent la
 * transition, et une grille en contient vingt.
 */
export async function withPosterTransition(
  element: HTMLElement | null | undefined,
  navigate: () => void | Promise<void>
): Promise<void> {
  if (!supportsViewTransitions() || prefersReducedMotion()) {
    await navigate();
    return;
  }

  const marque = element ?? null;
  if (marque) marque.style.viewTransitionName = POSTER_TRANSITION_NAME;

  // Le drapeau coupe la transition du routeur pendant toute la duree du transport : deux
  // mouvements pour une meme navigation se disputeraient l'attention.
  document.documentElement.setAttribute('data-view-transition', '');
  try {
    const transition = (document as DocumentWithViewTransition).startViewTransition!(() => navigate());
    /* Une transition peut etre abandonnee -- onglet en arriere-plan, seconde navigation
       par-dessus -- et chacune de ses promesses rejette alors de son cote. Seule
       `finished` est attendue ici : sans ce garde, les deux autres remontent en rejets
       non traites, qui polluent la console et declenchent les rapports d'erreur pour un
       evenement parfaitement normal. */
    transition.ready.catch(() => {});
    transition.updateCallbackDone.catch(() => {});
    await transition.finished;
  } catch {
    // Une transition interrompue -- navigation annulee, seconde transition par-dessus --
    // ne doit jamais empecher la navigation elle-meme d'avoir eu lieu.
  } finally {
    document.documentElement.removeAttribute('data-view-transition');
    if (marque) marque.style.viewTransitionName = '';
  }
}

/**
 * Cherche l'affiche a transporter a partir de l'element active.
 *
 * On vise le cadre et non l'image : le cadre existe toujours, y compris pour un media
 * sans affiche, alors que l'image peut manquer d'un cote comme de l'autre. Marquer une
 * image qui n'a pas d'equivalent a l'arrivee la ferait disparaitre en vol.
 */
export function posterElementFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('.poster-shell') as HTMLElement | null;
}
