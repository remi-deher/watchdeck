import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { AvailabilityRecord, AvailabilityPage } from '@/types/generated/mediaAvailability';
import { isInPlex } from '@/utils/mediaAvailability';
import { isPseudoRequester } from '@/utils/userLabels';
import { proxyUrl } from '@/utils/mediaImage';
import { api } from '@/api';
import { readCache, writeCache } from '@/cache';
import type { LibraryHub } from '@/composables/useLibraryHubs';
import { LIBRARY_SCROLL_KEY, libraryPageSize, libraryParams, matchesOrphanFilters, requestListParams } from './libraryRules';
import type { LibraryFilters } from './useLibraryFilters';

interface LibraryGridDeps {
  filters: LibraryFilters;
  /** Hub affiche : tant qu'il y en a un, la grille n'est pas lue. */
  activeHub: ComputedRef<LibraryHub>;
  hubLoading: ComputedRef<boolean>;
  refreshActiveHub: () => Promise<void>;
  error: Ref<string>;
}

/* La grille part des parametres DEMANDES par `load()`, appele aux memes moments qu'avant
   (filtre, URL, recherche apres 250 ms) : la frappe ne relance donc rien a elle seule.
   Quatre lectures, chacune sa cle : la bibliotheque (paginee, affichee des qu'elle
   arrive), puis demandes, orphelins *arr et metriques qui completent la vue au fil de
   l'eau -- aucune n'attend la plus lente, et changer de filtre annule celles en cours. */
interface GridRequest { library: string; requests: string; metricsType: string; wantsLibrary: boolean }

// Le cache SWR est indexe sur les parametres reellement envoyes : les charges utiles
// dependent des filtres, repeindre celles d'un autre filtre serait faux.
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const isCancel = (e: any) => e?.name === 'AbortError' || e?.name === 'CancelledError';

/**
 * Grille de la Bibliotheque (gabarit Explorer) : medias Plex pagines, demandes, orphelins
 * *arr et metriques, avec le cache qui repeint la derniere vue connue.
 */
export function useLibraryGrid({ filters, activeHub, hubLoading, refreshActiveHub, error }: LibraryGridDeps) {
  const { statusFilters, typeFilters, vf, sourceFilters, requesterFilters, plexServer, query } = filters;
  const PAGE_SIZE = libraryPageSize();

  const libraryItemsRaw = ref<any[]>([]);
  const pendingRequests = ref<any[]>([]);
  const allRequestsRaw = ref<any[]>([]);
  const requestSummary = ref<Record<string, any>>({ total: 0, facets: { by_type: {}, sources: [], requesters: [] } });
  const orphans = ref<any[]>([]);
  const rawMetrics = ref<Record<string, any>>({});
  const libraryOffset = ref(0);
  const hasMoreLibrary = ref(false);

  // Une demande partiellement disponible garde son library_item_id une fois indexee cote
  // Plex : on exclut le LibraryItem correspondant pour ne pas l'afficher deux fois (une
  // carte "en cours" avec son statut de progression suffit tant que ce n'est pas complet).
  const items = computed(() => {
    const partialLibraryIds = new Set(
      pendingRequests.value.filter((x: any) => x.status === 'partially_available' && x.library_item_id).map((x: any) => x.library_item_id)
    );
    const libraryItems = partialLibraryIds.size
      ? libraryItemsRaw.value.filter((x: any) => !partialLibraryIds.has(x.id))
      : libraryItemsRaw.value;
    // Filtre par serveur : une demande pas encore dans Plex n'est sur aucun serveur.
    if (plexServer.value) return libraryItems;
    return [...libraryItems, ...pendingRequests.value, ...orphans.value];
  });

  const queryClient = useQueryClient();

  // Serveurs Plex qui portent des medias : filtre et badge n'apparaissent qu'a partir de deux.
  const serversQuery = useQuery({
    queryKey: ['library', 'servers'],
    queryFn: ({ signal }) => api<any[]>('/api/library-servers', { signal }),
    staleTime: 5 * 60 * 1000,
  });
  const libraryServers = computed<any[]>(() => (Array.isArray(serversQuery.data.value) ? serversQuery.data.value : []));
  /** Serveurs supplementaires d'un media (4K, famille...) : le principal va de soi. */
  function serverNamesFor(item: any): string[] {
    const ids: number[] = item?.server_ids || [];
    if (libraryServers.value.length < 2 || !ids.length) return [];
    return libraryServers.value
      .filter((server: any) => !server.is_primary && ids.includes(server.id))
      .map((server: any) => server.name);
  }

  // La bibliotheque n'est concernee que si le filtre de statut inclut « Dans Plex » (ou
  // n'en selectionne aucun). Un LibraryItem n'a par ailleurs pas de `source` -- c'est un
  // media Plex, pas une demande : des qu'un filtre par source est actif, aucun ne peut
  // correspondre, autant ne pas demander la page du tout.
  const wantsLibraryItems = computed(() =>
    (!statusFilters.value.length || statusFilters.value.includes('library'))
    && !sourceFilters.value.length
  );

  const gridRequest = ref<GridRequest | null>(null);
  function gridSnapshot(): GridRequest {
    const library = libraryParams(filters.values(), 0, PAGE_SIZE);
    library.delete('offset');
    return {
      library: library.toString(),
      requests: requestListParams(filters.values()).toString(),
      metricsType: typeFilters.value.length === 1 ? typeFilters.value[0] : '',
      wantsLibrary: wantsLibraryItems.value,
    };
  }
  const gridActive = computed(() => activeHub.value === null && gridRequest.value !== null);

  const libraryQuery = useInfiniteQuery({
    queryKey: computed(() => ['library', 'items', gridRequest.value?.library]),
    queryFn: ({ pageParam, signal }) => api<AvailabilityRecord[]>(`/api/library?${gridRequest.value?.library}&offset=${pageParam}`, { signal }),
    initialPageParam: 0,
    getNextPageParam: (last: any[], pages: any[][]) => (last.length === PAGE_SIZE ? pages.reduce((sum, page) => sum + page.length, 0) : undefined),
    // Aucun media Plex ne peut correspondre aux filtres : on economise l'appel.
    enabled: computed(() => gridActive.value && Boolean(gridRequest.value?.wantsLibrary)),
    staleTime: 30_000,
  });
  const requestsQuery = useQuery({
    queryKey: computed(() => ['library', 'requests', gridRequest.value?.requests]),
    queryFn: ({ signal }) => api<AvailabilityPage>(`/api/requests-list?${gridRequest.value?.requests}`, { signal }),
    enabled: gridActive,
    staleTime: 30_000,
  });
  /* Les orphelins interrogent Sonarr/Radarr en direct : une panne ne doit pas bloquer la
     page, elle vaut simplement « aucun orphelin ». */
  const orphansQuery = useQuery({
    queryKey: ['library', 'orphans'],
    queryFn: ({ signal }) => api<any[]>('/api/requests/orphans', { signal }).catch((e) => (isCancel(e) ? Promise.reject(e) : [])),
    enabled: gridActive,
    staleTime: 30_000,
  });
  const metricsQuery = useQuery({
    queryKey: computed(() => ['library', 'metrics', gridRequest.value?.metricsType]),
    queryFn: ({ signal }) => {
      const type = gridRequest.value?.metricsType;
      return api<any>(`/api/library-metrics${type ? `?media_type=${type}` : ''}`, { signal }).catch((e) => (isCancel(e) ? Promise.reject(e) : {}));
    },
    enabled: gridActive,
    staleTime: 30_000,
  });

  const loadingMore = computed(() => libraryQuery.isFetchingNextPage.value);
  const loading = computed(() => {
    if (activeHub.value) return hubLoading.value;
    if (!gridRequest.value) return true;
    return gridRequest.value.wantsLibrary ? libraryQuery.isFetching.value && !loadingMore.value : requestsQuery.isFetching.value;
  });

  // Les donnees arrivees alimentent l'etat de la page, que primeFromCache a pu repeindre.
  watch(libraryQuery.data, (data) => {
    if (!data) return;
    const known = new Set<any>();
    const rows = data.pages.flat().filter((row: any) => (known.has(row.id) ? false : (known.add(row.id), true)));
    applyLibraryPage(rows);
    // `applyLibraryPage` deduit la suite de la taille d'UNE page ; ici `rows` les cumule
    // toutes : c'est la query qui sait s'il en reste.
    hasMoreLibrary.value = Boolean(libraryQuery.hasNextPage.value) && wantsLibraryItems.value;
  }, { immediate: true });
  watch([requestsQuery.data, metricsQuery.data], ([requests, stats]) => { if (requests) applyRequestData(requests, stats || {}); }, { immediate: true });
  // Les orphelins sont filtres sur la recherche : a refaire quand elle change, meme en cache.
  watch([orphansQuery.data, gridRequest], ([rows]) => { if (rows) applyOrphans(rows); }, { immediate: true });
  watch([libraryQuery.error, requestsQuery.error], (failures) => {
    const failure: any = failures.find((e: any) => e && !isCancel(e));
    if (failure) error.value = failure.message;
  });

  /* Ecrit une fois les deux vagues arrivees : le cache represente ainsi une page complete,
     jamais un etat intermediaire sans demandes ni orphelins. */
  let scrollRestored = false;
  watch(
    () => [libraryQuery.data.value, requestsQuery.data.value, orphansQuery.data.value, metricsQuery.data.value, requestsQuery.isFetching.value] as const,
    ([library, requests, orphanRows, stats, fetching]) => {
      if (!requests || !orphanRows || fetching) return;
      const firstPage = library?.pages[0];
      if (firstPage || !gridRequest.value?.wantsLibrary) {
        writeCache(cacheKey(), { library: firstPage || [], requests, stats: stats || {}, orphans: orphanRows });
      }
      const savedScroll = sessionStorage.getItem(LIBRARY_SCROLL_KEY);
      if (savedScroll && !scrollRestored) {
        scrollRestored = true;
        setTimeout(() => {
          window.scrollTo(0, Number(savedScroll));
          sessionStorage.removeItem(LIBRARY_SCROLL_KEY);
        }, 100);
      }
    },
  );

  const sources = computed(() => requestSummary.value.facets?.sources || []);
  const requesters = computed(() => {
    if (requestSummary.value.facets?.requesters?.length) return requestSummary.value.facets.requesters;
    const seen = new Map<string, string>();
    for (const row of allRequestsRaw.value) {
      const id = row.plex_user_id;
      if (isPseudoRequester(id) || seen.has(id)) continue;
      seen.set(id, row.requested_by || row.plex_user || id);
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  });

  // Les medias Plex et les demandes sont filtres en SQL ; seuls les orphelins le sont ici.
  const filtered = computed(() => {
    const orphanFilters = {
      statusFilters: statusFilters.value, typeFilters: typeFilters.value, vf: vf.value,
      sourceFilters: sourceFilters.value, requesterFilters: requesterFilters.value,
    };
    return items.value.filter((item: any) => {
      if (typeFilters.value.length && !typeFilters.value.includes(item.media_type)) return false;
      if (item.orphan) return matchesOrphanFilters(item, orphanFilters);
      return true;
    });
  });

  function cacheKey(): string {
    return `library:${libraryParams(filters.values(), 0, PAGE_SIZE)}|${requestListParams(filters.values())}`;
  }

  function applyRequestData(requests: any, stats: any): void {
    if (!requests) return;
    requestSummary.value = requests;
    allRequestsRaw.value = requests.items || [];
    pendingRequests.value = allRequestsRaw.value
      .filter((x: any) => statusFilters.value.length !== 1 || statusFilters.value[0] !== 'library' || isInPlex(x))
      .filter((x: any) => !wantsLibraryItems.value || !x.library_item_id || x.status === 'partially_available')
      .map((x: any) => ({ ...x, _kind: 'request', poster_url: proxyUrl(x.poster_url) }));
    rawMetrics.value = stats || {};
  }

  function applyOrphans(orphanRows: any[]): void {
    const searchQuery = query.value.trim().toLowerCase();
    const matching = searchQuery
      ? orphanRows.filter(row => row.title?.toLowerCase().includes(searchQuery))
      : orphanRows;
    orphans.value = matching.map(x => ({ ...x, _kind: 'request' }));
  }

  function applyLibraryPage(library: any[]): void {
    libraryItemsRaw.value = library.map(x => ({ ...x, _kind: 'library' }));
    libraryOffset.value = library.length;
    hasMoreLibrary.value = wantsLibraryItems.value && library.length === PAGE_SIZE;
  }

  /** Repeint la derniere vue connue pour ces filtres, avant le premier aller-retour reseau. */
  function primeFromCache(): void {
    const cached = readCache(cacheKey(), { maxAgeMs: CACHE_MAX_AGE_MS });
    if (!cached?.requests) return;
    applyLibraryPage(cached.library || []);
    applyRequestData(cached.requests, cached.stats);
    applyOrphans(cached.orphans || []);
  }

  /** Une demande a change : seules les demandes et les metriques sont a relire. */
  async function refreshRequestData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['library', 'requests'] }),
      queryClient.invalidateQueries({ queryKey: ['library', 'metrics'] }),
    ]);
  }

  /** La grille affichee correspond deja aux filtres courants (rien a relire). */
  function gridUpToDate(): boolean {
    return !activeHub.value && gridRequest.value !== null && JSON.stringify(gridRequest.value) === JSON.stringify(gridSnapshot());
  }

  /** Recharge : hub affiche, ou grille aux parametres courants (relue meme s'ils n'ont pas change). */
  async function load(): Promise<void> {
    error.value = '';
    if (activeHub.value) { await refreshActiveHub(); return; }
    const next = gridSnapshot();
    const unchanged = gridRequest.value !== null && JSON.stringify(gridRequest.value) === JSON.stringify(next);
    gridRequest.value = next;
    if (!next.wantsLibrary) applyLibraryPage([]);
    if (!unchanged) return;
    await Promise.all([
      next.wantsLibrary ? libraryQuery.refetch() : null,
      requestsQuery.refetch(),
      orphansQuery.refetch(),
      metricsQuery.refetch(),
    ]);
  }

  async function loadMore(): Promise<void> {
    if (loading.value || loadingMore.value || !hasMoreLibrary.value) return;
    await libraryQuery.fetchNextPage();
  }

  return {
    items: filtered, loading, loadingMore, hasMore: hasMoreLibrary, sources, requesters, libraryServers,
    serverNamesFor, primeFromCache, refreshRequestData, gridUpToDate, load, loadMore,
  };
}
