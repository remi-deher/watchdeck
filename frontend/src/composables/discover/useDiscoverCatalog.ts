import { computed, ref, type Ref } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { useInfiniteQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { isInPlex } from '@/utils/mediaAvailability';
import { mediaRequestKey } from '@/composables/useDirectMediaRequest';

interface CatalogPage { items?: any[]; page?: number; total_pages?: number; total_results?: number }

interface DiscoverCatalogOptions {
  /** Adresse de la premiere page pour les filtres du moment. */
  firstPageUrl: () => string;
  /** Appele avant chaque nouveau contexte (recherche, filtre, section) : remet l'adresse a jour. */
  syncUrl: () => void;
  /** Disponibilite choisie : filtre local, parmi les fiches deja chargees. */
  availability: Ref<string>;
}

/**
 * Catalogue d'Explorer (gabarit Explorer) : grille paginee a defilement continu, lue par
 * TanStack Query.
 *
 * Le catalogue part d'une URL DEMANDEE et non des filtres en direct : `load()` reste
 * appele aux memes moments qu'avant (filtre, section, recherche apres 300 ms), et
 * certains reglages ne concernent pas le serveur (disponibilite, filtre local). La cle
 * est l'URL de la premiere page ; les pages suivantes en sont DERIVEES, jamais des refs
 * du moment -- sinon une saisie en cours se glisserait dans la page 2 d'une ancienne
 * recherche. Changer de cle annule la lecture devenue obsolete.
 */
export function useDiscoverCatalog({ firstPageUrl, syncUrl, availability }: DiscoverCatalogOptions) {
const queryClient = useQueryClient();
const catalogUrl = ref<string | null>(null);
const catalogKey = computed(() => ['discover', 'catalog', catalogUrl.value]);
const FIRST_PAGE = 'page=1&paginated=true';
const catalogQuery = useInfiniteQuery({
  queryKey: catalogKey,
  queryFn: ({ pageParam, signal }) => api<CatalogPage>(String(catalogUrl.value).replace(FIRST_PAGE, `page=${pageParam}&paginated=true`), { signal }),
  initialPageParam: 1,
  getNextPageParam: (last: CatalogPage, pages: CatalogPage[]) => {
    const current = last.page || pages.length;
    return current < (last.total_pages || 1) ? current + 1 : undefined;
  },
  enabled: computed(() => catalogUrl.value !== null),
  staleTime: 60_000,
});
/* Les pages TMDB se recouvrent parfois : un media deja affiche n'est pas repete. */
const items = computed<any[]>(() => {
  const seen = new Set<string>();
  const list: any[] = [];
  for (const chunk of catalogQuery.data.value?.pages || []) {
    for (const item of chunk.items || []) {
      const key = mediaRequestKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(item);
    }
  }
  return list;
});
/* Le decompte annonce ce qui sera reellement affiche. `availability` trie cote client,
   parmi les seules fiches deja chargees : annoncer le total du serveur promettait
   « 10 000 resultats » pour une page qui allait en montrer trois, et le chiffre ne
   bougeait jamais d'un filtre a l'autre -- de quoi croire qu'aucun ne s'applique. */
const displayedItems = computed(() => items.value.filter(item => {
  if (availability.value === 'available') return isInPlex(item);
  if (availability.value === 'requested') return item.requested && !isInPlex(item);
  if (availability.value === 'new') return !item.requested && !isInPlex(item);
  return true;
}));
const hasMore = computed(() => Boolean(catalogQuery.hasNextPage.value));
const lastPage = computed(() => catalogQuery.data.value?.pages.at(-1));
const totalResults = computed(() => lastPage.value?.total_results || items.value.length);
const loadingMore = computed(() => catalogQuery.isFetchingNextPage.value);
const loading = computed(() => catalogQuery.isFetching.value && !loadingMore.value);
const error = computed(() => (catalogQuery.error.value as Error | null)?.message || '');

async function load({ append = false } = {}) {
  /* Charger la page suivante ne change rien a l'URL : la resynchroniser declenchait un
     `router.replace`, et le `scrollBehavior` du routeur ramenait la grille en haut a
     chaque palier de defilement infini. On ne l'appelle donc que pour un vrai
     changement de contexte (recherche, filtre, section). */
  if (append) { await catalogQuery.fetchNextPage(); return; }
  syncUrl();
  const next = firstPageUrl();
  if (catalogUrl.value === next) await catalogQuery.refetch();
  else catalogUrl.value = next;
}
function reload() { return load(); }
/** Quitter l'explorateur : la lecture en cours n'a plus de destinataire. */
function abortCatalog(): void {
  void queryClient.cancelQueries({ queryKey: ['discover', 'catalog'] });
}
function loadMore() { if (!loadingMore.value && hasMore.value) load({ append: true }); }
const debouncedReload = useDebounceFn(reload, 300);
function scheduleSearch() {
  abortCatalog();
  syncUrl();
  debouncedReload();
}

/** Reporter une demande sur le catalogue : il appartient au cache, on y remet une copie modifiee, sans muter. */
function patchMedia(key: string, update: any): void {
  queryClient.setQueryData<{ pages: CatalogPage[]; pageParams: unknown[] }>(catalogKey.value, (current) => current && {
    ...current,
    pages: current.pages.map((chunk) => ({
      ...chunk,
      items: (chunk.items || []).map((item) => (mediaRequestKey(item) === key ? { ...item, ...update } : item)),
    })),
  });
}

return {
  displayedItems, totalResults, hasMore, loading, loadingMore, error,
  load, reload, loadMore, abortCatalog, scheduleSearch, patchMedia,
};
}
