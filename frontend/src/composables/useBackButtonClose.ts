import { onBeforeUnmount, watch, type Ref } from 'vue';
import type { Router } from 'vue-router';

/**
 * Le bouton ou le geste « retour » referme la surface ouverte au lieu de quitter la page.
 *
 * Le focus, Echap et le piege de tabulation sont l'affaire de Reka UI ; le retour systeme
 * (Android, geste de bord sur iPhone), lui, arrive comme une navigation arriere du routeur.
 *
 * Les surfaces ne touchent plus a l'historique. Chacune poussait auparavant sa propre
 * entree « fantome » et la retirait a la fermeture par un `history.back()` differe --
 * un second mecanisme a cote du routeur, qui se desalignait :
 * - un filtre choisi pendant que le panneau etait ouvert reecrivait l'adresse de cette
 *   entree ; a la fermeture elle restait en place, et le retour suivant ramenait les
 *   anciens filtres au lieu de quitter la page ;
 * - le recul differe d'une surface fermee pouvait refermer la fiche ouverte juste apres.
 *
 * Desormais les surfaces ouvertes forment une pile, et un garde du routeur (voir
 * `installerRetourDesSurfaces`) annule une navigation arriere tant qu'il en reste une :
 * il referme la plus recente, et le routeur retablit l'adresse. L'historique ne contient
 * plus que de vraies pages.
 */

interface Surface {
  fermer: () => void;
}

const pile: Surface[] = [];

/** Nombre de surfaces ouvertes : pour les tests et le diagnostic. */
export function surfacesOuvertes(): number {
  return pile.length;
}

/** Referme la surface la plus recente ; vrai si une surface a ete refermee. */
export function fermerSurfaceDuDessus(): boolean {
  const surface = pile[pile.length - 1];
  if (!surface) return false;
  surface.fermer();
  return true;
}

/**
 * @param openRef Ref d'ouverture, ou `null` si le composant n'est monte que pendant
 *   l'ouverture.
 */
export function useBackButtonClose(openRef: Ref<boolean> | null | undefined, onClose: () => void): void {
  const surface: Surface = { fermer: onClose };

  function activate(): void {
    if (!pile.includes(surface)) pile.push(surface);
  }

  function deactivate(): void {
    const index = pile.indexOf(surface);
    if (index >= 0) pile.splice(index, 1);
  }

  if (openRef) watch(openRef, (open) => (open ? activate() : deactivate()), { immediate: true });
  else activate();

  onBeforeUnmount(deactivate);
}

/* Drapeau d'une navigation arriere en cours : le garde ne doit bloquer qu'un retour, jamais
   un lien ou un `router.push`.

   Il est pose par l'historique du routeur (`history.listen`), et non par un ecouteur
   `popstate` du navigateur : le routeur lance sa navigation -- et ses gardes -- de
   facon synchrone depuis son propre ecouteur, qui passait avant le notre quelle que soit
   la phase (verifie en E2E : le garde voyait le retour avant le drapeau, et le retour
   quittait la page au lieu de fermer la surface). Les abonnes de l'historique sont
   appeles dans l'ordre d'inscription, et le routeur n'inscrit le sien qu'a sa premiere
   navigation : celui-ci, pose a la creation du routeur, passe toujours avant. */
let navigationArriere = false;

/**
 * Branche la pile sur le routeur : une navigation arriere avec une surface ouverte ferme
 * cette surface et reste sur la page. A appeler une fois, a la creation du routeur, avant
 * sa premiere navigation.
 */
export function installerRetourDesSurfaces(router: Router): void {
  router.options.history.listen((_to, _from, info) => {
    navigationArriere = info.direction === 'back';
  });
  router.beforeEach(() => {
    const arriere = navigationArriere;
    navigationArriere = false;
    if (!arriere || !pile.length) return true;
    // Annuler rend l'adresse au routeur (il avance d'un cran) : la page ne bouge pas.
    fermerSurfaceDuDessus();
    return false;
  });
}
