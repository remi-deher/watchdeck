import { onUnmounted, ref, watchEffect, type Ref } from 'vue';

/**
 * Nature de la recherche d'une page.
 *
 * `search` interroge un corpus : le resultat peut contenir ce qui n'est pas a l'ecran.
 * `filter` reduit une liste deja affichee : il ne fait jamais apparaitre d'inedit.
 * Deux gestes opposes portaient la meme barre, sans que rien ne les distingue -- on ne
 * pouvait pas savoir, en tapant, si l'on elargissait ou si l'on retranchait.
 */
export type PageSearchKind = 'search' | 'filter';

export interface PageSearch {
  /** Faux lorsqu'une page fournit uniquement des filtres contextuels. */
  showSearch: boolean;
  kind: PageSearchKind;
  /** Lignes retenues et lignes totales, pour un filtre : « 43 sur 348 ». */
  matchCount?: number | null;
  totalCount?: number | null;
  query: string;
  placeholder: string;
  /** Périmètre lisible et clé stable de l'historique (Explorer, Bibliothèque…). */
  scopeLabel: string;
  hasFilters: boolean;
  filtersOpen: boolean;
  activeCount: number;
  onQuery: (value: string) => void;
  onSearch: (event: Event) => void;
  onToggleFilters: () => void;
}

const current = ref<PageSearch | null>(null);
/* Vue monte la page suivante avant de demonter la precedente : sans proprietaire
   identifie, le demontage de l'ancienne effacait la recherche que la nouvelle venait
   de declarer, et la barre retombait sur le declencheur de la palette. */
let owner: symbol | null = null;

/**
 * Recherche de la page courante, rendue par la barre de contexte.
 *
 * Le champ appartient toujours a la page — c'est elle qui possede la requete, les
 * filtres et leur effet — mais il s'affiche dans la barre, ou il ne defile pas et ou il
 * n'entre plus en concurrence visuelle avec la recherche globale. Faire remonter l'etat
 * plutot que descendre le rendu evite au shell de connaitre quoi que ce soit des pages :
 * il affiche ce qu'on lui donne, et rien quand on ne lui donne rien.
 */
export function providePageSearch(search: Ref<PageSearch | null>): void {
  const token = Symbol('page-search');
  watchEffect(() => {
    owner = token;
    current.value = search.value;
  });
  // Une page sans recherche ne doit pas heriter du champ de la precedente -- sauf si
  // une autre page a deja pris le relais.
  onUnmounted(() => {
    if (owner !== token) return;
    owner = null;
    current.value = null;
  });
}

/** Recherche fournie par la page, `null` si elle n'en declare pas. */
export function usePageSearch(): Ref<PageSearch | null> {
  return current;
}
