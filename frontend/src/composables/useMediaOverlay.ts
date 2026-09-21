import { computed, type ComputedRef } from 'vue';
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';

/**
 * La fiche d'un media s'ouvre par-dessus la page d'ou on vient.
 *
 * Elle reste une route a part entiere -- son adresse se partage, le bouton « retour »
 * la referme, un lien direct l'ouvre en pleine page. Mais quand on y arrive depuis une
 * grille, la grille ne disparait pas : elle reste derriere, assombrie. On n'a plus
 * l'impression de naviguer mais d'ouvrir, et c'est de cet ecart -- une vignette qui
 * devient une image pleine largeur au-dessus de ce qu'on regardait -- que vient le
 * mouvement. Une page qui remplace une page n'a rien a montrer.
 *
 * L'adresse de depart voyage dans l'etat de l'historique plutot que dans une variable :
 * elle survit ainsi au rechargement et aux allers-retours, et chaque entree porte la
 * sienne. Sans elle -- lien colle, favori, actualisation -- la fiche s'affiche en pleine
 * page, exactement comme avant.
 */

const CLE_FOND = '__overlayBackground';

export interface MediaOverlayState {
  /** Vrai quand la fiche courante doit se poser au-dessus d'une page existante. */
  actif: ComputedRef<boolean>;
  /** La route a rendre derriere, ou `null` pour rendre la route courante normalement. */
  routeDeFond: ComputedRef<RouteLocationNormalizedLoaded | null>;
  /** Referme la surface en revenant a la page de fond. */
  fermer: () => void;
}

/** Ajoute l'adresse de depart a une navigation, pour que la cible s'ouvre en surface. */
export function etatDeSurface(depuis: string): Record<string, unknown> {
  return { [CLE_FOND]: depuis };
}

/**
 * Ouvre une fiche media par-dessus la page courante.
 *
 * A utiliser partout ou l'on poussait `mediaDetailPath(...)` directement : sans l'adresse
 * de depart, la fiche remplacerait la page au lieu de s'y poser, et l'on perdrait la
 * grille -- sa position de defilement comprise.
 */
export function ouvrirFiche(
  router: { push: (to: any) => unknown },
  cible: string | Record<string, unknown>,
  depuis: string
): void {
  const destination = typeof cible === 'string' ? { path: cible } : { ...cible };
  (destination as Record<string, unknown>).state = etatDeSurface(depuis);
  void router.push(destination);
}

export function useMediaOverlay(): MediaOverlayState {
  const route = useRoute();
  const router = useRouter();

  const adresseDeFond = computed<string | null>(() => {
    // `route.fullPath` est lu pour que le calcul se refasse a chaque navigation :
    // `history.state` n'est pas reactif et ne declencherait rien de lui-meme.
    void route.fullPath;
    if (typeof history === 'undefined') return null;
    const valeur = (history.state as Record<string, unknown> | null)?.[CLE_FOND];
    return typeof valeur === 'string' && valeur ? valeur : null;
  });

  const routeDeFond = computed(() => {
    const adresse = adresseDeFond.value;
    if (!adresse) return null;
    try {
      return router.resolve(adresse) as unknown as RouteLocationNormalizedLoaded;
    } catch {
      // Une adresse devenue invalide ne doit pas empecher la fiche de s'afficher : on
      // retombe simplement sur la pleine page.
      return null;
    }
  });

  const actif = computed(() => routeDeFond.value !== null);

  function fermer(): void {
    // `back()` plutot qu'un `push` vers la page de fond : l'entree de la fiche est
    // consommee, et l'on retrouve la grille exactement ou on l'avait laissee --
    // position de defilement comprise.
    if (actif.value) router.back();
    else router.push('/discover');
  }

  return { actif, routeDeFond, fermer };
}
