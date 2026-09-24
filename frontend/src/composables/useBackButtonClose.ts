import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Le bouton ou le geste « retour » referme la surface ouverte au lieu de quitter la page.
 *
 * Le focus, Echap et le piege de tabulation sont l'affaire de Reka UI ; le retour systeme
 * (Android, application installee sur iPhone), lui, passe par l'historique, que Reka ne
 * touche pas. A l'ouverture on ajoute une entree marquee ; « retour » la consomme et
 * ferme la surface. A une fermeture explicite (croix, Echap, clic a cote), on la consomme
 * nous-memes, sans quoi le premier « retour » suivant ne ferait rien de visible.
 */

const HISTORY_MARKER = '__modalOpen';

/* Surfaces dont l'ecouteur `popstate` est actif.
 *
 * Reculer declenche une navigation, et la navigation emporte tout ce qui vient de s'ouvrir :
 * annuler une demande enchaine le choix du motif puis la confirmation, et cette derniere
 * disparaissait une seconde apres etre apparue. On ne recule donc que si personne n'a pris
 * la releve -- decide un tour complet de boucle d'evenements plus tard, la surface suivante
 * n'arrivant qu'au bout d'une chaine de promesses. */
let listeningSurfaces = 0;

/**
 * @param openRef Ref d'ouverture, ou `null` si le composant n'est monte que pendant
 *   l'ouverture.
 */
export function useBackButtonClose(openRef: Ref<boolean> | null | undefined, onClose: () => void): void {
  let dismissedByBackButton = false;
  let historyToken: string | null = null;
  let historyHref: string | null = null;

  function handlePopState(): void {
    dismissedByBackButton = true;
    onClose();
  }

  function activate(): void {
    if (typeof window === 'undefined' || historyToken) return;
    dismissedByBackButton = false;
    historyToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.addEventListener('popstate', handlePopState);
    listeningSurfaces += 1;
    history.pushState({ ...history.state, [HISTORY_MARKER]: historyToken }, '');
    historyHref = location.href;
  }

  function deactivate(): void {
    if (!historyToken) return;
    window.removeEventListener('popstate', handlePopState);
    listeningSurfaces = Math.max(0, listeningSurfaces - 1);
    /* On ne consomme l'entree que si c'est bien la notre (jeton exact) et que l'adresse n'a
       pas change : une page peut republier son URL pendant que la surface est ouverte -- le
       panneau de filtres porte chaque choix dans la barre d'adresse. Reculer alors
       annulait le filtre qu'on venait d'appliquer. */
    if (!dismissedByBackButton && history.state?.[HISTORY_MARKER] === historyToken && location.href === historyHref) {
      setTimeout(() => {
        if (listeningSurfaces > 0) return;
        history.back();
      }, 0);
    }
    historyToken = null;
    historyHref = null;
  }

  if (openRef) watch(openRef, (open) => (open ? activate() : deactivate()), { immediate: true });
  else activate();

  onBeforeUnmount(deactivate);
}
