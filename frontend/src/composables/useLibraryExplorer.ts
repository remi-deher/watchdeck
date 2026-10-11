import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { AvailabilityRecord, AvailabilityPage } from '@/types/generated/mediaAvailability';
import { isInPlex } from '@/utils/mediaAvailability';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { mediaDetailPath } from '@/mediaUrl';
import { REQUEST_STATUSES } from '@/utils/labels';
import { isPseudoRequester } from '@/utils/userLabels';
import { proxyUrl } from '@/utils/mediaImage';
import { api } from '@/api';
import { readCache, writeCache } from '@/cache';
import { useRealtime } from '@/events';
import { useLibraryHubs, type LibraryHub } from '@/composables/useLibraryHubs';
import { chipsFromGroups, useFiltersDrawer, type FilterGroupDefinition } from '@/composables/useFiltersDrawer';

/**
 * Donnees et etat de la Bibliotheque (gabarits Parcourir et Explorer) : filtres portes par
 * l'adresse, hubs de depart, grille paginee (medias Plex, demandes, orphelins *arr).
 * La page n'en tire que de quoi afficher : aucune action n'est decidee ici.
 */
export function useLibraryExplorer() {
const route = useRoute();
const router = useRouter();

// La modale Filtres modifie aussi le sous-type musical (Artistes/Albums/Pistes) -- on passe
// par l'URL plutot que d'assigner typeFilters.value directement, pour rester coherent avec
// la sidebar Bibliotheque (spaces.js) qui pilote deja le type de media via route.query.type. Le
// watcher existant sur route.query se charge ensuite de mettre typeFilters a jour et de
// recharger.
function onTypeFiltersChange(types: string[]): void {
  const q: Record<string, any> = { ...route.query };
  if (types.length) q.type = types;
  else delete q.type;
  router.replace({ path: '/library', query: q });
}

// L'overview d'une piste porte le titre de son album ("Artiste / Album: {titre}", voir
// plex_finder._plex_item_to_dict) -- une piste n'a pas de page de fiche dediee (pas de
// codec/duree affiches hors contexte album), on redirige donc vers l'album parent plutot
// que d'ouvrir la fiche de la piste elle-meme.
async function openTrackAlbum(item: any): Promise<any> {
  const match = /^Artiste \/ Album: (.+)$/m.exec(item.overview || '');
  const albumTitle = match ? match[1].trim() : '';
  if (albumTitle) {
    try {
      const albums = await api(`/api/library?media_types=album&query=${encodeURIComponent(albumTitle)}&limit=5`);
      const album = albums.find((a: any) => a.title === albumTitle) || albums[0];
      if (album) return album;
    } catch {
      // Recherche d'album impossible (reseau, Plex indisponible...) : on retombe sur la
      // fiche de la piste plutot que de bloquer la navigation.
    }
  }
  return null;
}

async function openDetail(item: any): Promise<void> {
  sessionStorage.setItem('library.scroll_position', String(window.scrollY));
  if (item.media_type === 'track') {
    const album = await openTrackAlbum(item);
    if (album) {
      ouvrirFiche(router, mediaDetailPath(album, 'library'), route.fullPath);
      return;
    }
  }
  ouvrirFiche(router, mediaDetailPath(item, item._kind), route.fullPath);
}

// Une page de 200 cartes represente ~47 ecrans de defilement sur un telephone (mesure
// a 375x812) : le chargement incremental existe, mais son grain etait pense pour un
// grand ecran. Le lot est reduit sous 640px, la sentinelle de defilement se chargeant
// d'enchainer. Fige au montage : changer la taille de lot en cours de session
// desalignerait les offsets deja demandes.
const PAGE_SIZE = window.matchMedia('(max-width: 640px)').matches ? 60 : 200;

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

const IN_PROGRESS_STATUSES = ['pending_approval', 'pending', 'sent_to_arr', 'partially_available'];
const savedFilters = JSON.parse(sessionStorage.getItem('library.active_filters') || '{}');
const hubRequested = route.query.hub === '1';

const query = ref(String(route.query.query || (!hubRequested && savedFilters.query) || ''));
const statusFilters = ref<string[]>(
  route.query.status
    ? (Array.isArray(route.query.status) ? route.query.status as string[] : [String(route.query.status)])
    : (route.query.sort === 'requested_desc' ? ['pending_approval', 'pending', 'sent_to_arr', 'partially_available', 'failed'] : ((!hubRequested && savedFilters.statusFilters) || ['library']))
);
const typeFilters = ref<string[]>(
  route.query.type
    ? (Array.isArray(route.query.type) ? route.query.type as string[] : [String(route.query.type)])
    : (!hubRequested && savedFilters.typeFilters) || []
);
const vf = ref(String(route.query.vf || (!hubRequested && savedFilters.vf) || ''));
const subtitle = ref(String(route.query.subtitle || (!hubRequested && savedFilters.subtitle) || ''));
const sourceFilters = ref<string[]>((!hubRequested && savedFilters.sourceFilters) || []);
const requesterFilters = ref<string[]>((!hubRequested && savedFilters.requesterFilters) || []);
const decade = ref(String(route.query.decade || (!hubRequested && savedFilters.decade) || ''));
const sort = ref(String(route.query.sort || (!hubRequested && savedFilters.sort) || ''));
const genre = ref(String(route.query.genre || (!hubRequested && savedFilters.genre) || ''));
const audioFormat = ref(String(route.query.audio_format || (!hubRequested && savedFilters.audioFormat) || ''));
const releaseType = ref(String(route.query.release_type || (!hubRequested && savedFilters.releaseType) || ''));
const hiRes = ref(String(route.query.hi_res || (!hubRequested && savedFilters.hiRes) || ''));
// Serveur Plex (Bibliotheque multi-serveurs) : ne montre que les medias vus sur lui.
const plexServer = ref(String(route.query.server || (!hubRequested && savedFilters.plexServer) || ''));
// La sidebar Bibliotheque (spaces.js) derive son onglet actif uniquement de
// route.query.type -- si on arrive sur /library sans query et que typeFilters a ete
// restaure depuis sessionStorage, la query ne le reflete pas encore : l'onglet actif
// n'apparaitrait pas au premier rendu bien que le filtrage soit deja correct. On pousse
// une seule fois la valeur restauree dans l'URL pour que la sidebar la reflete direct.
if (!hubRequested && !route.query.type && typeFilters.value.length) {
  router.replace({ query: { ...route.query, type: typeFilters.value } });
}

// Atterrissage "hub" sur Musiques : seulement quand aucun filtre n'affine la vue par
// defaut (les 3 sous-types de musique tous selectionnes, aucun autre critere) -- des
// qu'un filtre est pose, la grille classique (deja filtree) est plus utile qu'un hub qui
// ne saurait pas quoi mettre en avant.
const isMusicShape = computed(() =>
  typeFilters.value.length === 3 && ['artist', 'album', 'track'].every(t => typeFilters.value.includes(t))
);
const isMusicHub = computed(() => {
  if (!isMusicShape.value) return false;
  return !query.value.trim() && !decade.value && !genre.value && !audioFormat.value
    && !releaseType.value && !hiRes.value && !sort.value && !plexServer.value;
});
// Cible d'un clic sur l'en-tete d'une rangee du hub -- meme mecanisme que
// la sidebar Bibliotheque (spaces.js, libraryTarget) : clone la query active pour ne pas ecraser d'autres
// filtres, ne fixe que "type".
function musicFilterTarget(types: string[]) {
  return { path: '/library', query: { ...detailQuery(), type: types } };
}

function detailQuery(): Record<string, any> {
  const query: Record<string, any> = { ...route.query };
  delete query.hub;
  return query;
}

// Meme principe pour Films/Series : atterrissage "hub" (derniers ajouts + dernieres
// demandes) quand un seul type est choisi et qu'aucun autre filtre n'est pose --
// contrairement a la musique, un seul sous-type existe ici (pas d'Artistes/Albums/
// Pistes), donc pas de sous-navigation, juste les deux rangees.
const singleType = computed(() => (typeFilters.value.length === 1 ? typeFilters.value[0] : ''));
const isMovieShowShape = computed(() => ['movie', 'show'].includes(singleType.value));
const isMovieShowHub = computed(() => {
  if (!isMovieShowShape.value) return false;
  return !query.value.trim()
    && statusFilters.value.length === 1 && statusFilters.value[0] === 'library'
    && !vf.value && !sourceFilters.value.length && !requesterFilters.value.length
    && !sort.value && !decade.value && !genre.value && !plexServer.value;
});

// Hub "Tout" : meme principe pour la vue d'atterrissage sans type selectionne --
// hero + une rangee par bibliotheque + dernieres demandes, façon accueil Plex.
const isAllShape = computed(() => !typeFilters.value.length);
const isAllHub = computed(() => {
  if (!isAllShape.value) return false;
  return !query.value.trim()
    && statusFilters.value.length === 1 && statusFilters.value[0] === 'library'
    && !vf.value && !sourceFilters.value.length && !requesterFilters.value.length
    && !sort.value && !decade.value && !genre.value && !plexServer.value;
});

function allRequestsTarget() {
  return { path: '/library', query: { ...detailQuery(), status: REQUEST_STATUSES } };
}

function genreFilterTarget(g: string) {
  return { path: '/library', query: { ...detailQuery(), genre: g } };
}

// Clic sur "Derniers ajouts" : pas un sous-type a filtrer (musique comme films/series
// gardent le meme typeFilters), juste un tri explicite qui fait sortir du hub -- sort
// est porte dans l'URL pour que la grille reste selectionnee apres navigation retour.
function showAllByRecent() {
  router.push({ path: '/library', query: { ...detailQuery(), sort: 'added_desc' } });
}
// "Dernieres demandes" filtre sur les statuts "en cours" (meme raccourci que la modale
// Filtres, voir onDraftStatusChange) plutot que sur un statut "in_progress" litteral :
// route.query.status est lu tel quel par le watcher de route.query, sans l'expansion que
// fait la modale sur son propre brouillon.
function typeRequestsTarget() {
  return { path: '/library', query: { ...detailQuery(), type: [singleType.value], status: REQUEST_STATUSES } };
}

const error = ref('');

const statusSingle = computed({
  get: (): string => {
    if (!statusFilters.value.length) return '';
    if (statusFilters.value.some(s => IN_PROGRESS_STATUSES.includes(s))) return 'in_progress';
    return statusFilters.value[0] || 'library';
  },
  set: (v: string) => {
    if (!v) statusFilters.value = [];
    else if (v === 'in_progress') statusFilters.value = [...IN_PROGRESS_STATUSES];
    else statusFilters.value = [v];
  },
});
const sourceSingle = computed({
  get: (): string => sourceFilters.value[0] || '',
  set: (v: string) => { sourceFilters.value = v ? [v] : []; },
});
const requesterSingle = computed({
  get: (): string => requesterFilters.value[0] || '',
  set: (v: string) => { requesterFilters.value = v ? [v] : []; },
});

const { activeCount: activeFilterCount, reset: resetFilters } = useFiltersDrawer(
  {
    statusFilters,
    vf,
    subtitle,
    sourceFilters,
    requesterFilters,
    decade,
    sort,
    genre,
    audioFormat,
    releaseType,
    hiRes,
    plexServer,
    query,
  },
  {
    statusFilters: ['library'],
    vf: '',
    subtitle: '',
    sourceFilters: [],
    requesterFilters: [],
    decade: '',
    sort: '',
    genre: '',
    audioFormat: '',
    releaseType: '',
    hiRes: '',
    plexServer: '',
    query: '',
  }
);

// Rangees des trois pages d'atterrissage. Les predicats isAllHub/isMusicHub/
// isMovieShowHub restent ici : ils dependent des filtres actifs, pas du chargement.
/** Hub affiche a la place de la grille, s'il y en a un. */
const activeHub = computed<LibraryHub>(() =>
  isAllHub.value ? 'all' : isMusicHub.value ? 'music' : isMovieShowHub.value ? 'type' : null);
const { music: musicHub, all: allHub, type: typeHub, refreshActiveHub } =
  useLibraryHubs({ activeHub, hubMediaType: singleType, onError: message => { error.value = message; } });
const { recent: musicHubRecent, artists: musicHubArtists, albums: musicHubAlbums, tracks: musicHubTracks, loading: musicHubLoading } = musicHub;
const { recent: allHubRecent, movies: allHubMovies, shows: allHubShows, music: allHubMusic, requests: allHubRequests, loading: allHubLoading } = allHub;
const { recent: typeHubRecent, requests: typeHubRequests, genreRows: typeHubGenreRows, loading: typeHubLoading } = typeHub;

/* La grille part des parametres DEMANDES par `load()`, appele aux memes moments qu'avant
   (filtre, URL, recherche apres 250 ms) : la frappe ne relance donc rien a elle seule.
   Quatre lectures, chacune sa cle : la bibliotheque (paginee, affichee des qu'elle
   arrive), puis demandes, orphelins *arr et metriques qui completent la vue au fil de
   l'eau -- aucune n'attend la plus lente, et changer de filtre annule celles en cours. */
interface GridRequest { library: string; requests: string; metricsType: string; wantsLibrary: boolean }
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
const gridRequest = ref<GridRequest | null>(null);
function gridSnapshot(): GridRequest {
  const library = _libraryParams(0);
  library.delete('offset');
  return {
    library: library.toString(),
    requests: _requestListParams().toString(),
    metricsType: typeFilters.value.length === 1 ? typeFilters.value[0] : '',
    wantsLibrary: wantsLibraryItems.value,
  };
}
const gridActive = computed(() => activeHub.value === null && gridRequest.value !== null);
const isCancel = (e: any) => e?.name === 'AbortError' || e?.name === 'CancelledError';

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
  if (activeHub.value === 'all') return allHub.loading.value;
  if (activeHub.value === 'music') return musicHub.loading.value;
  if (activeHub.value === 'type') return typeHub.loading.value;
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
      writeCache(_cacheKey(), { library: firstPage || [], requests, stats: stats || {}, orphans: orphanRows });
    }
    const savedScroll = sessionStorage.getItem('library.scroll_position');
    if (savedScroll && !scrollRestored) {
      scrollRestored = true;
      setTimeout(() => {
        window.scrollTo(0, Number(savedScroll));
        sessionStorage.removeItem('library.scroll_position');
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

// La bibliotheque n'est concernee que si le filtre de statut inclut « Dans Plex » (ou
// n'en selectionne aucun). Un LibraryItem n'a par ailleurs pas de `source` -- c'est un
// media Plex, pas une demande : des qu'un filtre par source est actif, aucun ne peut
// correspondre, autant ne pas demander la page du tout.
const wantsLibraryItems = computed(() =>
  (!statusFilters.value.length || statusFilters.value.includes('library'))
  && !sourceFilters.value.length
);

// Les medias Plex et les demandes sont desormais filtres en SQL (voir _libraryParams et
// _requestListParams) : les refiltrer ici ne changerait rien au mieux, et donnait un
// resultat faux des que la liste depassait une page -- « VF uniquement » ne filtrait que
// les 200 premiers medias charges et masquait tout le reste de la bibliotheque.
//
// Les orphelins restent filtres localement : ils viennent de Sonarr/Radarr en un seul
// bloc, sans pagination, donc le filtrage client y est exact.
function matchesOrphanFilters(item: any): boolean {
  if (statusFilters.value.length && !statusFilters.value.includes('orphan')) return false;
  if (typeFilters.value.length && !typeFilters.value.includes(item.media_type)) return false;
  if (vf.value === 'vf' && item.has_vf !== true) return false;
  if (vf.value === 'vo' && item.has_vf !== false) return false;
  if (vf.value === 'unchecked' && item.has_vf != null) return false;
  if (sourceFilters.value.length && !sourceFilters.value.includes(item.source)) return false;
  if (requesterFilters.value.length && !requesterFilters.value.includes(item.plex_user_id)) return false;
  return true;
}

const filtered = computed(() => items.value.filter((item: any) => {
  if (typeFilters.value.length && !typeFilters.value.includes(item.media_type)) return false;
  if (item.orphan) return matchesOrphanFilters(item);
  return true;
}));

/* Surveille l'adresse, pas l'objet `route.query`. Posee derriere une fiche, la page lit
   la route de fond (RouteScope), puis la route courante a la fermeture : deux objets
   differents pour la meme adresse. Chacun relancait ce watcher, qui reassignait les
   filtres et rechargeait la grille -- la page se rafraichissait et remontait en haut a
   chaque ouverture et fermeture de fiche. */
watch(
  () => route.fullPath,
  () => {
    const value: any = route.query;
    const returningToHub = value.hub === '1';
    query.value = value.query || '';
    statusFilters.value = value.status
      ? (Array.isArray(value.status) ? value.status : [value.status])
      : (value.sort === 'requested_desc' ? ['pending_approval', 'pending', 'sent_to_arr', 'partially_available', 'failed'] : ['library']);
    typeFilters.value = value.type ? (Array.isArray(value.type) ? value.type : [value.type]) : [];
    // Les titres des rangees naviguent avec des query params (genre, tri, etc.).
    // Resynchroniser tous les filtres pilotes par l'URL est indispensable : sinon
    // l'adresse changeait bien, mais le hub restait affiche avec les anciennes valeurs.
    vf.value = value.vf || '';
    decade.value = value.decade || '';
    sort.value = value.sort || '';
    genre.value = value.genre || '';
    audioFormat.value = value.audio_format || '';
    releaseType.value = value.release_type || '';
    hiRes.value = value.hi_res || '';
    // Comme les sous-titres : le serveur choisi survit aux changements d'onglet de type.
    if (value.server) plexServer.value = String(value.server);
    if (returningToHub) {
      sourceFilters.value = [];
      requesterFilters.value = [];
    }
    load();
  },
);
// `vf` fait partie de la liste depuis que le filtre est applique en SQL : tant qu'il ne
// servait qu'au filtrage client, le changer suffisait a recalculer `filtered` sans
// rechargement -- ce n'est plus le cas.
watch(
  [statusFilters, typeFilters, sourceFilters, requesterFilters, vf, subtitle, decade, sort, genre, audioFormat, releaseType, hiRes, plexServer],
  () => {
    sessionStorage.setItem('library.active_filters', JSON.stringify({
      query: query.value,
      statusFilters: statusFilters.value,
      typeFilters: typeFilters.value,
      vf: vf.value,
      subtitle: subtitle.value,
      sourceFilters: sourceFilters.value,
      requesterFilters: requesterFilters.value,
      decade: decade.value,
      sort: sort.value,
      genre: genre.value,
      audioFormat: audioFormat.value,
      releaseType: releaseType.value,
      hiRes: hiRes.value,
      plexServer: plexServer.value,
    }));
    load();
  },
  { deep: true },
);

function _libraryParams(offset: number): URLSearchParams {
  const p = new URLSearchParams();
  if (query.value.trim()) p.set('query', query.value.trim());
  if (typeFilters.value.length) p.set('media_types', typeFilters.value.join(','));
  if (vf.value) p.set('vf', vf.value);
  if (subtitle.value) p.set('subtitle', subtitle.value);
  if (requesterFilters.value.length) p.set('requesters', requesterFilters.value.join(','));
  if (decade.value) p.set('decade', decade.value);
  if (sort.value) p.set('sort', sort.value);
  if (genre.value) p.set('genre', genre.value);
  if (audioFormat.value) p.set('audio_format', audioFormat.value);
  if (releaseType.value) p.set('release_type', releaseType.value);
  if (hiRes.value) p.set('hi_res', hiRes.value);
  if (plexServer.value) p.set('server_id', plexServer.value);
  p.set('limit', String(PAGE_SIZE));
  p.set('offset', String(offset));
  return p;
}

function _requestListParams(): URLSearchParams {
  const p = new URLSearchParams({ limit: '500' });
  const q = query.value.trim();
  if (q) p.set('query', q);
  // « Dans Plex » exige un lien vers la bibliothèque synchronisée.
  if (statusFilters.value.length === 1 && statusFilters.value[0] === 'library') p.set('in_plex', 'true');
  const selectedStatuses = statusFilters.value.includes('library')
    ? [...new Set([...statusFilters.value.filter(value => value !== 'library'), 'available', 'partially_available'])]
    : statusFilters.value;
  if (selectedStatuses.length) p.set('statuses', selectedStatuses.join(','));
  // Une serie garde le statut « partiellement disponible » tant qu'elle n'a pas fini de
  // diffuser, meme a jour sur tout ce qui est sorti. Ce raffinement ne s'applique que si
  // l'utilisateur a explicitement choisi ce statut : sous « Dans Plex », une serie a jour
  // doit rester visible.
  if (statusFilters.value.includes('partially_available') && !statusFilters.value.includes('library')) {
    p.set('strict_partial', 'true');
  }
  if (typeFilters.value.length) p.set('media_types', typeFilters.value.join(','));
  if (sourceFilters.value.length) p.set('sources', sourceFilters.value.join(','));
  if (requesterFilters.value.length) p.set('requesters', requesterFilters.value.join(','));
  if (vf.value) p.set('vf', vf.value);
  return p;
}

// Le cache SWR est indexe sur les parametres reellement envoyes : les charges utiles
// dependent des filtres, repeindre celles d'un autre filtre serait faux.
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
function _cacheKey(): string {
  return `library:${_libraryParams(0)}|${_requestListParams()}`;
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
  const cached = readCache(_cacheKey(), { maxAgeMs: CACHE_MAX_AGE_MS });
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

useRealtime(['request.updated'], (type?: string, event?: any) => {
  if (!type || ['plex-sync', 'plex-sync-recent'].includes(event?.job) || event?.library_changed) {
    return load();
  }
  return refreshRequestData().catch(() => {});
});
onMounted(async () => {
  primeFromCache();
  await load();
});

/* La frappe relit la grille apres 250 ms : une lecture devenue obsolete est annulee par
   TanStack Query au changement de cle. Rien a relire si la requete n'a pas change (la
   route vient de poser la meme valeur). */
const scheduleLoad = useDebounceFn(() => {
  if (!activeHub.value && gridRequest.value && JSON.stringify(gridRequest.value) === JSON.stringify(gridSnapshot())) return;
  void load();
}, 250);
watch(query, () => { scheduleLoad(); });

const libraryItemKey = (item: any): string => `${item._kind}-${item.id}`;

/* Filtres : des definitions (donnees), rendues par le meme composant que les autres pages.
   La forme « musique » n'a pas les memes criteres que films et series. */
const ALL = { value: '', label: 'Tous' };
function group(key: string, label: string, options: Array<{ value: string; label: string }>, value: string, set: (v: string) => void, fallback = ''): FilterGroupDefinition {
  return { key, label, options, value, set, fallback };
}
const fromPairs = (pairs: string[][]) => pairs.map(([value, label]) => ({ value, label }));
const filterGroups = computed<FilterGroupDefinition[]>(() => {
  const groups: FilterGroupDefinition[] = isMusicShape.value
    ? [
      group('sort', 'Tri', [{ value: '', label: 'Ajouts récents' }, { value: 'title_asc', label: 'Titre (A-Z)' }, { value: 'title_desc', label: 'Titre (Z-A)' }, { value: 'year_desc', label: 'Année (récent → ancien)' }], sort.value, (v) => { sort.value = v; }),
      group('genre', 'Genre', [ALL, ...['Rock', 'Pop', 'Jazz', 'Electronic', 'Hip-Hop', 'Metal', 'Classical', 'Blues', 'Folk', 'Indie'].map((g) => ({ value: g, label: g }))], genre.value, (v) => { genre.value = v; }),
      group('audioFormat', 'Format', [ALL, ...fromPairs([['FLAC', 'FLAC'], ['ALAC', 'ALAC'], ['WAV', 'WAV'], ['MP3', 'MP3'], ['AAC', 'AAC / M4A'], ['OGG', 'OGG']])], audioFormat.value, (v) => { audioFormat.value = v; }),
      group('releaseType', 'Type', [ALL, ...fromPairs([['album', 'Album Studio'], ['single', 'Single / EP'], ['live', 'Concert / Live'], ['compilation', 'Compilation']])], releaseType.value, (v) => { releaseType.value = v; }),
      group('hiRes', 'Qualité', [{ value: '', label: 'Toutes' }, { value: 'hi_res', label: 'Hi-Res (24-bit / 96kHz+)' }, { value: 'standard', label: 'CD Standard (16-bit)' }], hiRes.value, (v) => { hiRes.value = v; }),
      group('decade', 'Époque', [{ value: '', label: 'Toutes' }, ...fromPairs([['2020s', '2020+'], ['2010s', 'Années 2010'], ['2000s', 'Années 2000'], ['90s', 'Années 90'], ['80s', 'Années 80'], ['70s', 'Années 70 et avant']])], decade.value, (v) => { decade.value = v; }),
    ]
    : [
      group('status', 'Statut', [{ value: '', label: 'Tous les statuts' }, { value: 'library', label: 'Dans Plex' }, { value: 'in_progress', label: 'En cours' }, { value: 'partially_available', label: 'Partiellement dispo' }, { value: 'orphan', label: 'Suivi Sonarr/Radarr' }, { value: 'pending_approval', label: 'À approuver' }, { value: 'pending', label: 'En attente' }, { value: 'sent_to_arr', label: 'Transmise' }, { value: 'failed', label: 'Échec' }, { value: 'rejected', label: 'Refusée' }], statusSingle.value, (v) => { statusSingle.value = v; }, 'library'),
      group('vf', 'Version', [{ value: '', label: 'Toutes les langues' }, { value: 'vf', label: 'VF uniquement' }, { value: 'vf_secondary', label: 'VF secondaire' }, { value: 'vo', label: 'VO uniquement' }, { value: 'mixed', label: 'Mixte (VF + VO)' }, { value: 'unchecked', label: 'Non analysée' }], vf.value, (v) => { vf.value = v; }),
      group('subtitle', 'Sous-titres', [ALL, { value: 'any_issue', label: 'Problème sous-titre FR' }, { value: 'sub_fr_absent', label: 'Sous-titre FR absent' }, { value: 'sub_fr_no_track', label: 'Sous-titres incrustés' }, { value: 'sub_fr_not_default', label: 'Sous-titre FR non activé' }, { value: 'forced_fr_not_default', label: 'Sous-titre forcé FR non activé' }], subtitle.value, (v) => { subtitle.value = v; }),
      ...(sources.value.length ? [group('source', 'Source', [{ value: '', label: 'Toutes' }, ...sources.value.map((value: string) => ({ value, label: value }))], sourceSingle.value, (v) => { sourceSingle.value = v; })] : []),
      ...(requesters.value.length > 1 ? [group('requester', 'Demandeur', [ALL, ...requesters.value.map((r: any) => ({ value: r.id, label: r.label }))], requesterSingle.value, (v) => { requesterSingle.value = v; })] : []),
    ];
  if (libraryServers.value.length > 1) {
    groups.push(group('server', 'Serveur', [ALL, ...libraryServers.value.map((server: any) => ({ value: String(server.id), label: server.name }))], plexServer.value, (v) => { plexServer.value = v; }));
  }
  return groups;
});
/* Filtres actifs, en pastilles retirables au-dessus des resultats. */
const chips = computed(() => chipsFromGroups(filterGroups.value));

/* Pages d'atterrissage (gabarit Parcourir) : banniere et rangees de chaque hub. */
const hubRows = computed<any[]>(() => {
  const empty = 'Aucun média.';
  if (activeHub.value === 'all') {
    return [
      { kind: 'posters', key: 'recent', title: 'Derniers ajouts', items: allHubRecent.value, loading: allHubLoading.value, clickable: true, emptyMessage: empty },
      { kind: 'posters', key: 'requests', title: 'Dernières demandes', items: allHubRequests.value, loading: allHubLoading.value, moreTo: allRequestsTarget(), emptyMessage: empty },
      { kind: 'posters', key: 'movies', title: 'Films', items: allHubMovies.value, loading: allHubLoading.value, moreTo: musicFilterTarget(['movie']), emptyMessage: empty },
      { kind: 'posters', key: 'shows', title: 'Séries', items: allHubShows.value, loading: allHubLoading.value, moreTo: musicFilterTarget(['show']), emptyMessage: empty },
      { kind: 'posters', key: 'music', title: 'Musique', items: allHubMusic.value, loading: allHubLoading.value, moreTo: musicFilterTarget(['artist', 'album', 'track']), size: 'music', emptyMessage: empty },
    ];
  }
  if (activeHub.value === 'music') {
    return [
      { kind: 'posters', key: 'recent', title: 'Derniers ajouts', items: musicHubRecent.value, loading: musicHubLoading.value, clickable: true, size: 'music', emptyMessage: empty },
      { kind: 'posters', key: 'artists', title: 'Artistes', items: musicHubArtists.value, loading: musicHubLoading.value, moreTo: musicFilterTarget(['artist']), size: 'music', emptyMessage: empty },
      { kind: 'posters', key: 'albums', title: 'Albums', items: musicHubAlbums.value, loading: musicHubLoading.value, moreTo: musicFilterTarget(['album']), size: 'music', emptyMessage: empty },
      { kind: 'posters', key: 'tracks', title: 'Titres', items: musicHubTracks.value, loading: musicHubLoading.value, moreTo: musicFilterTarget(['track']), size: 'music', emptyMessage: empty },
    ];
  }
  if (activeHub.value === 'type') {
    return [
      { kind: 'posters', key: 'recent', title: 'Derniers ajouts', items: typeHubRecent.value, loading: typeHubLoading.value, clickable: true, emptyMessage: empty },
      { kind: 'posters', key: 'requests', title: 'Dernières demandes', items: typeHubRequests.value, loading: typeHubLoading.value, moreTo: typeRequestsTarget(), emptyMessage: empty },
      ...typeHubGenreRows.value.map((row: any) => ({ kind: 'posters', key: `genre-${row.genre}`, title: row.genre, items: row.items, loading: typeHubLoading.value, moreTo: genreFilterTarget(row.genre), emptyMessage: empty })),
    ];
  }
  return [];
});
const heroItems = computed<any[]>(() => {
  if (activeHub.value === 'all') return allHubRecent.value.slice(0, 5);
  if (activeHub.value === 'type') return typeHubRecent.value.slice(0, 5);
  return [];
});
/** Le titre « Derniers ajouts » mene a la grille triee par ajout. */
function onHubTitleClick(rowKey: string): void {
  if (rowKey === 'recent') showAllByRecent();
}

return {
  query, activeHub, isMusicShape, filterGroups, chips, activeFilterCount, resetFilters,
  hubRows, heroItems, onHubTitleClick,
  items: filtered, loading, loadingMore, hasMore: hasMoreLibrary, error, load, loadMore,
  libraryItemKey, serverNamesFor, openDetail,
};
}
