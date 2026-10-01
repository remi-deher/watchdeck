import { ref } from 'vue';
import type { Router } from 'vue-router';
import { destinationForPath, isAdminSpace } from '@/navigation';

/**
 * Dernière page de l'application visitée hors de l'espace Administration : c'est là que
 * ramène « Retour à Watchdeck ».
 *
 * L'état vit au niveau du module et non dans le shell : celui-ci peut être remonté (en
 * changeant de mode d'affichage), et la page d'où l'on vient ne doit pas se perdre avec
 * lui. Le suivi passe donc par le routeur, qui voit toutes les navigations, y compris
 * celle du chargement initial.
 */
export const lastAppPath = ref('/');

export function suivreDernierePageApp(router: Router): void {
  router.afterEach((to, _from, failure) => {
    if (failure || !to.matched.length || to.meta?.public) return;
    // Droits maximaux : on ne cherche qu'a savoir si le chemin releve de l'espace
    // Administration, pas si l'utilisateur y a acces.
    if (isAdminSpace(destinationForPath(to.path, true, true))) return;
    lastAppPath.value = to.fullPath;
  });
}
