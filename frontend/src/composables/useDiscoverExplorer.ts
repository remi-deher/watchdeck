import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { useInfiniteQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { isInPlex } from '@/utils/mediaAvailability';
import { mediaRequestKey, useDirectMediaRequest } from '@/composables/useDirectMediaRequest';
import { chipsFromGroups, useFiltersDrawer, type FilterGroupDefinition } from '@/composables/useFiltersDrawer';
import { mediaDetailPath } from '@/mediaUrl';
import { usePreference } from '@/composables/usePreference';

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Plus populaires' },
  { value: 'primary_release_date.desc', label: 'Plus récents' },
  { value: 'vote_average.desc', label: 'Mieux notés' },
];
const AVAILABILITY_OPTIONS = [
  { value: '', label: 'Tous les états' },
  { value: 'available', label: 'Dans Plex' },
  { value: 'requested', label: 'Déjà demandé' },
  { value: 'new', label: 'À demander' },
];

/**
 * Donnees et etat d'Explorer (gabarits Parcourir et Explorer) : accueil et page d'un
 * diffuseur en rangees, catalogue en grille filtree, demandes de media. Les filtres sont
 * portes par l'adresse. La page n'en tire que de quoi afficher.
 */
export function useDiscoverExplorer() {
const initialParams = new URLSearchParams(window.location.search);
const route = useRoute();
const router = useRouter();
function initialModeFromLocation(): 'home' | 'explore' {
  if (
    ['/discover/explore', '/discover/movies', '/discover/shows'].includes(window.location.pathname) ||
    window.location.pathname.startsWith('/discover/source/') ||
    initialParams.get('mode') === 'explore'
  ) return 'explore';
  return 'home';
}
const validMediaTypes = new Set(['all', 'movie', 'show']);
function mediaTypeFromLocation(params = new URLSearchParams(window.location.search), path = window.location.pathname): string {
  if (path === '/discover/movies') return 'movie';
  if (path === '/discover/shows') return 'show';
  const type = params.get('type');
  return type && validMediaTypes.has(type) ? type : 'all';
}
const validSections = new Set(['trending', 'popular', 'coming-soon', 'genres']);
const mode = ref<'home' | 'explore'>(initialModeFromLocation());
const query = ref(initialParams.get('q') || '');
/* La saisie lance une recherche ; une valeur posee par la page elle-meme (adresse, section,
   diffuseur) ne doit pas en lancer une seconde : son chargement est deja programme. */
let queryFromCode: string | null = null;
function assignQuery(value: string): void {
  queryFromCode = value;
  query.value = value;
  void Promise.resolve().then(() => { queryFromCode = null; });
}
const mediaType = ref(mediaTypeFromLocation(initialParams));
const section = ref(validSections.has(initialParams.get('section') || '') ? initialParams.get('section') as string : 'trending');
const genre = ref(initialParams.get('genre') || '');
const availability = ref(['available', 'requested', 'new'].includes(initialParams.get('availability') || '') ? initialParams.get('availability') as string : '');
const sourceKey = ref(initialParams.get('source') || (window.location.pathname.startsWith('/discover/source/') ? window.location.pathname.replace('/discover/source/', '').replace('/', ':') : ''));
const sortBy = ref(initialParams.get('sort') || 'popularity.desc');
const genres = ref<any[]>([]);
const sources = ref<any[]>([]);
const genreOptions = computed(() => [{ value: '', label: 'Tous' }, ...genres.value.map((entry) => ({ value: String(entry.id), label: entry.name }))]);
const sourceOptions = computed(() => [{ value: '', label: 'Tous' }, ...sources.value.map((source) => ({ value: `${source.kind}:${source.id}`, label: source.name }))]);
const sourcesLoading = ref(true);
const sourcesError = ref('');
const homeLoaded = ref(false);
const hideAvailable = usePreference('discover.hideAvailable', false);
const hideWatched = usePreference('discover.hideWatched', false);

function emptyPersonalizedRail() {
  return { items: [] as any[] };
}
const personalized = reactive({
  available: false,
  loading: false,
  error: '',
  seeds: [] as any[],
  recommended: emptyPersonalizedRail(),
  preferred_genres: emptyPersonalizedRail(),
  unwatched_popular: emptyPersonalizedRail(),
  followed_series: emptyPersonalizedRail(),
} as Record<string, any>);

function sectionState() {
  return { item: null as any, items: [] as any[], loading: true, error: '' };
}
const home = reactive({
  hero: sectionState(),
  trending: sectionState(),
  popular_movies: sectionState(),
  popular_tv: sectionState(),
  upcoming: sectionState(),
  recent_plex: sectionState(),
  most_requested: sectionState(),
  genre_action: sectionState(),
  genre_scifi: sectionState(),
  genre_animation: sectionState(),
  genre_comedy: sectionState(),
  genre_thriller: sectionState(),
  genre_horror: sectionState(),
} as Record<string, any>);

function emptySourceSection() {
  return { items: [] as any[], loading: false, error: '' };
}
const sourceHome = reactive({
  hero: emptySourceSection(),
  movies: emptySourceSection(),
  shows: emptySourceSection(),
  genre_action: emptySourceSection(),
  genre_scifi: emptySourceSection(),
  genre_animation: emptySourceSection(),
  genre_comedy: emptySourceSection(),
  genre_thriller: emptySourceSection(),
  genre_horror: emptySourceSection(),
} as Record<string, any>);
let sourceHomeLoadedFor = '';


const mediaTypes = [
  { value: 'all', label: 'Tout' },
  { value: 'movie', label: 'Films' },
  { value: 'show', label: 'Séries' },
];

const isSourceMode = computed(() => Boolean(sourceKey.value || route.path.startsWith('/discover/source/')));

const activeSourceKind = computed(() => {
  const key = sourceKey.value || (route.params.kind && route.params.id ? `${route.params.kind}:${route.params.id}` : '');
  return key ? key.split(':')[0] : '';
});

const isProviderMode = computed(() => !fixedMediaType.value && isSourceMode.value && activeSourceKind.value === 'provider');

function sourceTypePath(type: string): { path: string; query: Record<string, any> } | undefined {
  const key = sourceKey.value || (route.params.kind && route.params.id ? `${route.params.kind}:${route.params.id}` : '');
  if (!key) return undefined;
  const path = type === 'movie' ? '/discover/movies' : type === 'show' ? '/discover/shows' : '/discover/explore';
  const q: Record<string, any> = { source: key };
  if (activeSourceName.value && activeSourceName.value !== 'Diffuseur') q.name = activeSourceName.value;
  return { path, query: q };
}

function sourceGenrePath(genreId: string): { path: string; query: Record<string, any> } | undefined {
  const key = sourceKey.value || (route.params.kind && route.params.id ? `${route.params.kind}:${route.params.id}` : '');
  if (!key) return undefined;
  const q: Record<string, any> = { source: key, genre: genreId };
  if (activeSourceName.value && activeSourceName.value !== 'Diffuseur') q.name = activeSourceName.value;
  return { path: '/discover/explore', query: q };
}

const activeSourceName = computed(() => {
  if (route.query.name) return String(route.query.name);
  const currentKey = sourceKey.value || (route.params.kind && route.params.id ? `${route.params.kind}:${route.params.id}` : '');
  if (currentKey) {
    const [kind, id] = currentKey.split(':');
    const match = sources.value.find((s: any) => s.kind === kind && String(s.id) === String(id));
    if (match) return match.name;
  }
  return 'Diffuseur';
});

const sourceKindBadge = computed(() => {
  const kind = sourceKey.value ? sourceKey.value.split(':')[0] : (route.params.kind || '');
  switch (kind) {
    case 'provider': return 'Plateforme de streaming';
    case 'network': return 'Réseau de diffusion';
    case 'company': return 'Studio de production';
    default: return 'Diffuseur';
  }
});

const availableMediaTypes = computed(() => {
  const kind = sourceKey.value ? sourceKey.value.split(':')[0] : (route.params.kind || '');
  return kind === 'network' ? [{ value: 'show', label: 'Séries' }] : mediaTypes;
});

const fixedMediaType = computed(() => route.path === '/discover/movies' ? 'movie' : route.path === '/discover/shows' ? 'show' : '');

const pageTitle = computed(() => {
  if (isSourceMode.value) return activeSourceName.value;
  if (fixedMediaType.value === 'movie') return 'Films';
  if (fixedMediaType.value === 'show') return 'Séries';
  return 'Découvrir';
});

const searchPlaceholder = computed(() => fixedMediaType.value === 'movie'
  ? 'Rechercher un film'
  : fixedMediaType.value === 'show'
    ? 'Rechercher une série'
    : 'Rechercher un film ou une série');
const sections = [
  { value: 'trending', label: 'Tendances' },
  { value: 'popular', label: 'Populaires' },
  { value: 'coming-soon', label: 'Bientôt' },
  { value: 'genres', label: 'Par genre' },
];
const sectionLabel = computed(() => sections.find(entry => entry.value === section.value)?.label || 'Catalogue');
const sectionDescription = computed(() => ({
  trending: 'Les médias qui attirent le plus l’attention',
  popular: 'Les incontournables du moment',
  'coming-soon': 'Les prochaines sorties à surveiller',
  genres: 'Explorez le catalogue par univers',
})[section.value]);

/* Ce que les deux longs groupes retiennent, pour le dire sans les deplier. */
const genreLabel = computed(() => genres.value.find(g => String(g.id) === String(genre.value))?.name || 'Tous');
const sourceLabel = computed(() => sources.value.find(s => `${s.kind}:${s.id}` === sourceKey.value)?.name || 'Tous');

/* Le decompte du pied du tiroir. Les filtres s'appliquent a la volee ici : `totalResults`
   suit donc la selection en cours, il n'y a pas d'etat « en attente » a prevoir. Hors du
   mode explorateur il ne veut rien dire -- l'accueil n'est pas une liste filtree -- et le
   pied retombe alors sur un libelle generique plutot que d'afficher zero. */
/* Le decompte annonce ce qui sera reellement affiche. `availability` trie cote client,
   parmi les seules fiches deja chargees : annoncer le total du serveur promettait
   « 10 000 resultats » pour une page qui allait en montrer trois, et le chiffre ne
   bougeait jamais d'un filtre a l'autre -- de quoi croire qu'aucun ne s'applique. */
const filteredCount = computed(() => {
  if (mode.value !== 'explore' || !displayedItems.value.length) return null;
  return availability.value ? displayedItems.value.length : totalResults.value;
});

const { activeCount: activeFilterCount, reset: resetFiltersDrawer } = useFiltersDrawer(
  { mediaType, section, genre, availability, sourceKey, sortBy },
  {
    mediaType: fixedMediaType.value || 'all',
    section: 'trending',
    genre: '',
    availability: '',
    sourceKey: '',
    sortBy: 'popularity.desc',
  },
  {
    memoriser: 'decouvrir',
    // Section et source sont de la navigation, pas des filtres a retenir.
    champsMemorises: ['genre', 'availability', 'sortBy'],
    parametresAdresse: { sortBy: 'sort' },
    activeCountFn: () => [
      !fixedMediaType.value && mediaType.value !== 'all',
      !isSourceMode.value && section.value !== 'trending',
      genre.value,
      availability.value,
      sourceKey.value && !route.path.startsWith('/discover/source/'),
      isSourceMode.value && sortBy.value !== 'popularity.desc',
    ].filter(Boolean).length,
    onReset: async () => {
      await loadGenres();
      if (mode.value === 'explore') {
        await reload();
      }
    },
  }
);
const displayedItems = computed(() => items.value.filter(item => {
  if (availability.value === 'available') return isInPlex(item);
  if (availability.value === 'requested') return item.requested && !isInPlex(item);
  if (availability.value === 'new') return !item.requested && !isInPlex(item);
  return true;
}));
const hasMore = computed(() => Boolean(catalogQuery.hasNextPage.value));
const { requesting, requestError, requestSuccess, requestMedia, optionsDialog, confirmOptions, cancelOptions } = useDirectMediaRequest({ onUpdated: updateMatchingMedia });

function updateMatchingMedia(changed: any, update: any) {
  const key = mediaRequestKey(changed);
  // Le catalogue appartient au cache : on y remet une copie modifiee, sans muter.
  queryClient.setQueryData<{ pages: CatalogPage[]; pageParams: unknown[] }>(catalogKey.value, (current) => current && {
    ...current,
    pages: current.pages.map((chunk) => ({
      ...chunk,
      items: (chunk.items || []).map((item) => (mediaRequestKey(item) === key ? { ...item, ...update } : item)),
    })),
  });
  // Accueil et recommandations sont un etat local de la page, pas le cache.
  for (const state of Object.values(home) as any[]) {
    if (state.item && mediaRequestKey(state.item) === key) Object.assign(state.item, update);
    for (const item of state.items) if (mediaRequestKey(item) === key) Object.assign(item, update);
  }
  for (const name of ['recommended', 'preferred_genres', 'unwatched_popular', 'followed_series']) {
    for (const item of personalized[name].items) if (mediaRequestKey(item) === key) Object.assign(item, update);
  }
}
function detailPath(item: any) {
  const kind = item.library_id ? 'library' : item.request_id ? 'request' : 'discover';
  return mediaDetailPath(item, kind, { discover: true });
}
function cardActionLabel(item: any) {
  if (item.in_library || item.library_id) return 'Voir la fiche';
  if (item.requested || item.request_id) return 'Suivre la demande';
  return 'Demander';
}
function canRequest(item: any) {
  return !item.in_library && !item.library_id && !item.requested && !item.request_id;
}
function sourcePath(source: any) {
  return {
    path: `/discover/source/${source.kind}/${source.id}`,
    query: { name: source.name, ...(fixedMediaType.value ? { type: fixedMediaType.value } : {}) },
  };
}
function showHome() {
  abortCatalog();
  mode.value = 'home';
  router.push('/discover');
  if (!homeLoaded.value) loadHome();
}
async function showExplorer() {
  mode.value = 'explore';
  syncExplorerUrl();
  if (!genres.value.length) loadGenres();
  if (!sources.value.length) loadSources();
  if (isProviderMode.value) {
    const [, id] = (sourceKey.value || '').split(':');
    if (id) loadProviderHome(Number(id));
  } else {
    await load();
  }
}
function startSearch() {
  mode.value = 'explore';
  mediaType.value = 'all';
  syncExplorerUrl();
  scheduleSearch();
}
function handleSearchInput() {
  if (mode.value === 'home') startSearch();
  else scheduleSearch();
}

/* URL que la page vient d'ecrire elle-meme. Le `watch` de la route ne doit reagir qu'aux
   vraies navigations (precedent, suivant, lien partage) : relancer `load()` sur la mise a
   jour de `?q=` qui suit chaque frappe court-circuitait le delai de la recherche, et
   envoyait une requete par lettre tapee. */
let selfWrittenUrl = '';
function replaceExplorerUrl(target: { path: string; query: Record<string, string> }): void {
  selfWrittenUrl = router.resolve(target).fullPath;
  router.replace(target);
}
function syncExplorerUrl() {
  if (mode.value !== 'explore') return;
  const params = new URLSearchParams();
  if (query.value.trim()) params.set('q', query.value.trim());
  if (!fixedMediaType.value && mediaType.value !== 'all') params.set('type', mediaType.value);
  if (!isSourceMode.value && section.value !== 'trending') params.set('section', section.value);
  if (genre.value) params.set('genre', genre.value);
  if (availability.value) params.set('availability', availability.value);
  if (sortBy.value && sortBy.value !== 'popularity.desc') params.set('sort', sortBy.value);

  if (route.path.startsWith('/discover/source/')) {
    if (activeSourceName.value && activeSourceName.value !== 'Diffuseur') params.set('name', activeSourceName.value);
    replaceExplorerUrl({ path: route.path, query: Object.fromEntries(params.entries()) });
    return;
  }

  if (sourceKey.value) params.set('source', sourceKey.value);
  const path = fixedMediaType.value === 'movie' ? '/discover/movies' : fixedMediaType.value === 'show' ? '/discover/shows' : '/discover/explore';
  replaceExplorerUrl({ path, query: Object.fromEntries(params.entries()) });
}

function applyExplorerUrl() {
  if (route.path === '/discover') {
    abortCatalog();
    mode.value = 'home';
    sourceKey.value = '';
    if (!homeLoaded.value) loadHome();
    return;
  }
  if (route.path.startsWith('/discover/source/')) {
    const kind = route.params.kind;
    const id = route.params.id;
    sourceKey.value = `${kind}:${id}`;
    mode.value = 'explore';
    assignQuery(String(route.query.q || ''));
    mediaType.value = ['movie', 'show'].includes(String(route.query.type)) ? String(route.query.type) : (kind === 'network' ? 'show' : 'all');
    genre.value = String(route.query.genre || '');
    sortBy.value = ['popularity.desc', 'primary_release_date.desc', 'vote_average.desc'].includes(String(route.query.sort)) ? String(route.query.sort) : 'popularity.desc';
    availability.value = ['available', 'requested', 'new'].includes(String(route.query.availability)) ? String(route.query.availability) : '';
    if (!sources.value.length) loadSources();
    if (kind === 'provider' && !route.query.type && !route.query.q && !route.query.genre && !route.query.section) {
      loadProviderHome(Number(id));
    } else {
      load();
    }
    return;
  }
  if (!['/discover/explore', '/discover/movies', '/discover/shows'].includes(route.path)) return;
  const params = new URLSearchParams(route.query as Record<string, string>);
  mode.value = 'explore';
  assignQuery(params.get('q') || '');
  mediaType.value = mediaTypeFromLocation(params, route.path);
  section.value = validSections.has(params.get('section') || '') ? (params.get('section') as string) : 'trending';
  genre.value = params.get('genre') || '';
  availability.value = ['available', 'requested', 'new'].includes(params.get('availability') || '') ? (params.get('availability') as string) : '';
  sourceKey.value = params.get('source') || '';
  sortBy.value = ['popularity.desc', 'primary_release_date.desc', 'vote_average.desc'].includes(params.get('sort') || '') ? (params.get('sort') as string) : 'popularity.desc';
  loadGenres();
  if (!sources.value.length) loadSources();
  load();
}

async function loadHomeGroup() {
  home.hero.loading = true;
  home.trending.loading = true;
  home.hero.error = '';
  home.trending.error = '';
  try {
    const payload = await api('/api/discover/home?sections=hero,trending');
    Object.assign(home.hero, payload.sections.hero, { loading: false, error: payload.sections.hero.error || '' });
    Object.assign(home.trending, payload.sections.trending, { loading: false, error: payload.sections.trending.error || '' });
  } catch (loadError: any) {
    home.hero.error = loadError.message;
    home.trending.error = loadError.message;
    home.hero.loading = false;
    home.trending.loading = false;
  }
}
const GENRE_RAILS = [
  { key: 'genre_action', title: 'Action & Aventure', genre: '28' },
  { key: 'genre_scifi', title: 'Science-Fiction & Fantastique', genre: '878' },
  { key: 'genre_animation', title: 'Animation', genre: '16' },
  { key: 'genre_comedy', title: 'Comédies', genre: '35' },
  { key: 'genre_thriller', title: 'Thrillers & Policiers', genre: '5388' },
  { key: 'genre_horror', title: 'Horreur & Mystère', genre: '27' },
];
function loadGenreRails(): void {
  for (const rail of GENRE_RAILS) loadHomeSection(rail.key);
}

async function loadHomeSection(name: string) {
  home[name].loading = true;
  home[name].error = '';
  try {
    const payload = await api(`/api/discover/home?sections=${name}`);
    Object.assign(home[name], payload.sections[name], { loading: false, error: payload.sections[name].error || '' });
  } catch (loadError: any) {
    home[name].error = loadError.message;
    home[name].loading = false;
  }
}
async function loadSources() {
  sourcesLoading.value = true;
  sourcesError.value = '';
  try {
    const payload = await api('/api/discover/sources');
    sources.value = payload.items || [];
  } catch (loadError: any) {
    sourcesError.value = loadError.message;
  } finally {
    sourcesLoading.value = false;
  }
}
function loadHome() {
  homeLoaded.value = true;
  loadHomeGroup();
  for (const name of [
    'popular_movies',
    'popular_tv',
    'upcoming',
    'recent_plex',
    'most_requested',
  ]) loadHomeSection(name);
  loadSources();
  loadPersonalized();
}

async function loadPersonalized() {
  personalized.loading = true;
  personalized.error = '';
  try {
    const params = new URLSearchParams({
      hide_available: String(hideAvailable.value),
      hide_watched: String(hideWatched.value),
    });
    const payload = await api(`/api/discover/personalized?${params}`);
    personalized.available = Boolean(payload.available);
    personalized.seeds = payload.seeds || [];
    personalized.error = payload.error || '';
    for (const name of ['recommended', 'preferred_genres', 'unwatched_popular', 'followed_series']) {
      personalized[name].items = payload.sections?.[name]?.items || [];
    }
  } catch (loadError: any) {
    personalized.available = true;
    personalized.error = loadError.message;
  } finally {
    personalized.loading = false;
  }
}

function reloadPersonalized() {
  loadPersonalized();
}

async function setMediaType(value: string) {
  if (mode.value !== 'explore') mode.value = 'explore';
  mediaType.value = value;
  genre.value = '';
  await loadGenres();
  await reload();
}
function setSection(value: string) {
  if (mode.value !== 'explore') mode.value = 'explore';
  section.value = value;
  assignQuery('');
  genre.value = '';
  sourceKey.value = '';
  reload();
}
function selectSource() {
  if (mode.value !== 'explore') mode.value = 'explore';
  assignQuery('');
  genre.value = '';
  sourceHomeLoadedFor = ''; // Forcer un rechargement si on change de provider
  const currentKey = sourceKey.value;
  if (currentKey && currentKey.startsWith('provider:')) {
    const [, id] = currentKey.split(':');
    if (id) { loadProviderHome(Number(id)); return; }
  }
  reload();
}
function setAvailability(value: string) {
  if (mode.value !== 'explore') mode.value = 'explore';
  availability.value = availability.value === value ? '' : value;
  reload();
}
function setSort(value: string) {
  if (mode.value !== 'explore') mode.value = 'explore';
  sortBy.value = value;
  reload();
}
function setGenre(value: string) {
  if (mode.value !== 'explore') mode.value = 'explore';
  genre.value = genre.value === value ? '' : value;
  reload();
}
function resetFilters() {
  resetFiltersDrawer();
}
async function loadGenres() {
  try {
    genres.value = await api(`/api/discover/genres?media_type=${mediaType.value}`);
  } catch {
    genres.value = [];
  }
}
function endpoint(targetPage: number) {
  const type = `media_type=${mediaType.value}`;
  const pagination = `page=${targetPage}&paginated=true`;
  const sortParam = sortBy.value ? `&sort_by=${sortBy.value}` : '';
  const q = query.value.trim();
  if (q) return `/api/discover/search?query=${encodeURIComponent(q)}&${type}&${pagination}`;
  if (sourceKey.value) {
    const [kind, id] = sourceKey.value.split(':');
    return `/api/discover/source/${kind}/${id}?${type}&${pagination}${sortParam}`;
  }
  if (section.value === 'trending') return `/api/discover/trending?${type}&${pagination}`;
  if (section.value === 'popular') return `/api/discover/popular?${type}&${pagination}`;
  if (section.value === 'coming-soon') return `/api/discover/coming-soon?${type}&${pagination}`;
  return `/api/discover/discover?${type}&${pagination}${genre.value ? `&genre=${genre.value}` : ''}`;
}
/* Le catalogue part d'une URL DEMANDEE et non des filtres en direct : `load()` reste
   appele aux memes moments qu'avant (filtre, section, recherche apres 300 ms), et
   certains reglages ne concernent pas le serveur (disponibilite, filtre local). La cle
   est l'URL de la premiere page ; les pages suivantes en sont DERIVEES, jamais des refs
   du moment -- sinon une saisie en cours se glisserait dans la page 2 d'une ancienne
   recherche. Changer de cle annule la lecture devenue obsolete. */
interface CatalogPage { items?: any[]; page?: number; total_pages?: number; total_results?: number }
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
  syncExplorerUrl();
  const next = endpoint(1);
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
  syncExplorerUrl();
  debouncedReload();
}

function retryProviderHome(): void {
  const [, id] = (sourceKey.value || '').split(':');
  if (id) loadProviderHome(Number(id));
}

async function loadProviderHome(providerId: number | string) {
  const key = String(providerId);
  if (sourceHomeLoadedFor === key) return; // Évite les rechargements inutiles lors de re-render
  sourceHomeLoadedFor = key;

  const SECTIONS = ['hero', 'movies', 'shows', 'genre_action', 'genre_scifi', 'genre_animation', 'genre_comedy', 'genre_thriller', 'genre_horror'];

  // Mettre toutes les sections en état "loading"
  for (const name of SECTIONS) {
    sourceHome[name].loading = true;
    sourceHome[name].error = '';
    sourceHome[name].items = [];
  }

  try {
    const payload = await api(`/api/discover/source/provider/${providerId}/home?sections=${SECTIONS.join(',')}`);
    const sections = payload.sections || {};
    for (const name of SECTIONS) {
      const section = sections[name] || {};
      sourceHome[name].items = section.items || [];
      sourceHome[name].error = section.error || '';
      sourceHome[name].loading = false;
    }
  } catch (loadError: any) {
    for (const name of SECTIONS) {
      sourceHome[name].error = loadError.message;
      sourceHome[name].loading = false;
    }
  }
}

onMounted(() => {
  if (mode.value === 'home') loadHome();
  else if (mode.value === 'explore') showExplorer();
});
watch(() => [route.path, route.query.type, route.query.section, route.query.genre, route.query.availability, route.query.source, route.query.sort, route.query.q], ([path], [prevPath]) => {
  // La recherche d'accueil change seulement l'URL : le même champ et les mêmes
  // résultats restent montés, sans lancer une seconde requête ni perdre le focus.
  if (prevPath === '/discover' && path === '/discover/explore' && mode.value === 'explore' && query.value) return;
  // Mise a jour ecrite par la page elle-meme : son chargement est deja programme.
  if (selfWrittenUrl && route.fullPath === selfWrittenUrl) { selfWrittenUrl = ''; return; }
  applyExplorerUrl();
});

watch(query, (value) => {
  if (value === queryFromCode) return;
  handleSearchInput();
});

/* Filtres : des definitions (donnees), rendues par le meme composant que les autres pages. */
const onSourcePage = computed(() => route.path.startsWith('/discover/source/'));
const filterGroups = computed<FilterGroupDefinition[]>(() => {
  const groups: FilterGroupDefinition[] = [];
  if (!isSourceMode.value) {
    groups.push({ key: 'section', label: 'Section', options: sections, value: query.value ? '' : section.value, fallback: query.value ? '' : 'trending', set: setSection });
  }
  if (!fixedMediaType.value) {
    groups.push({ key: 'type', label: 'Type de média', options: availableMediaTypes.value, value: mediaType.value, fallback: 'all', set: (value) => { void setMediaType(value); } });
  }
  if (isSourceMode.value) {
    groups.push({ key: 'sort', label: 'Tri', options: SORT_OPTIONS, value: sortBy.value, fallback: 'popularity.desc', set: setSort });
  }
  groups.push({ key: 'availability', label: 'Disponibilité', options: AVAILABILITY_OPTIONS, value: availability.value || '', fallback: '', set: setAvailability });
  // Vingt-et-un genres et une trentaine de diffuseurs : repliés d'office, ils annoncent ce qu'ils retiennent.
  if (genres.value.length) {
    groups.push({ key: 'genre', label: 'Genre', options: genreOptions.value, value: genre.value ? String(genre.value) : '', fallback: '', set: setGenre, collapsed: true, summary: genreLabel.value });
  }
  if (sources.value.length) {
    groups.push({ key: 'source', label: 'Diffuseur / Studio', options: sourceOptions.value, value: sourceKey.value || '', fallback: '', set: (key) => { sourceKey.value = key; selectSource(); }, collapsed: true, summary: sourceLabel.value });
  }
  return groups;
});
/* Filtres actifs, en pastilles retirables au-dessus des resultats. Sur la page d'un diffuseur,
   le diffuseur est le sujet de la page, pas un filtre. */
const chips = computed(() => chipsFromGroups(filterGroups.value.filter((group) => !(group.key === 'source' && onSourcePage.value))));

/* Pages a parcourir (gabarit Parcourir) : accueil et page d'un diffuseur, en rangees. */
const REQUESTABLE_ROWS = new Set(['trending', 'popular_movies', 'popular_tv', 'upcoming', 'movies', 'shows', ...GENRE_RAILS.map(rail => rail.key)]);
const PROVIDER_GENRE_RAILS = [
  { key: 'genre_action', title: 'Action & Aventure', genre: '28' },
  { key: 'genre_scifi', title: 'Science-Fiction & Fantastique', genre: '878' },
  { key: 'genre_animation', title: 'Animation', genre: '16' },
  { key: 'genre_comedy', title: 'Comédies', genre: '35' },
  { key: 'genre_thriller', title: 'Thrillers & Policiers', genre: '53' },
  { key: 'genre_horror', title: 'Horreur & Mystère', genre: '27' },
];
const poster = (key: string, title: string, state: any, moreTo?: any) =>
  ({ kind: 'posters', key, title, items: state.items, loading: state.loading, error: state.error, moreTo: moreTo || null, emptyMessage: 'Aucun média à afficher.' });
const personalizedShown = computed(() => personalized.loading || personalized.available || Boolean(personalized.error));
const homeRows = computed<any[]>(() => [
  { kind: 'section', key: 'sources' },
  poster('trending', 'Tendances aujourd’hui', home.trending, { path: '/discover/explore' }),
  ...(personalizedShown.value ? [{ kind: 'section', key: 'personalized' }] : []),
  poster('popular_movies', 'Films populaires', home.popular_movies, { path: '/discover/movies', query: { section: 'popular' } }),
  poster('popular_tv', 'Séries populaires', home.popular_tv, { path: '/discover/shows', query: { section: 'popular' } }),
  // Genres generiques : replies par defaut et charges a l'ouverture seulement (six appels evites a chaque affichage).
  { kind: 'collapsible', key: 'genres', title: 'Explorer par genre', eyebrow: 'Catalogue', storageKey: 'watchdeck.discoverGenresOpen' },
  poster('upcoming', 'Prochainement', home.upcoming, { path: '/discover/explore', query: { section: 'coming-soon' } }),
  poster('recent_plex', 'Ajouts récents dans Plex', home.recent_plex, { path: '/discover/explore', query: { availability: 'available' } }),
  ...(home.most_requested.loading || home.most_requested.items.length || home.most_requested.error
    ? [poster('most_requested', 'Les plus demandés', home.most_requested, { path: '/discover/explore', query: { availability: 'requested' } })]
    : []),
]);
const providerRows = computed<any[]>(() => [
  poster('movies', `Films sur ${activeSourceName.value}`, sourceHome.movies, sourceTypePath('movie')),
  poster('shows', `Séries sur ${activeSourceName.value}`, sourceHome.shows, sourceTypePath('show')),
  ...PROVIDER_GENRE_RAILS.map(rail => poster(rail.key, rail.title, sourceHome[rail.key], sourceGenrePath(rail.genre))),
]);
/** Banniere et rangees de la vue a parcourir : l'accueil, ou la page d'une plateforme. */
const browse = computed(() => (isProviderMode.value
  ? { hero: sourceHome.hero.items, heroLoading: sourceHome.hero.loading, heroEyebrow: `À la une sur ${activeSourceName.value}`, rows: providerRows.value }
  : { hero: home.hero.items, heroLoading: home.hero.loading, heroEyebrow: '', rows: homeRows.value }));
/** Parcourir quand rien n'est filtre ni cherche ; sinon Explorer. */
const browsing = computed(() => mode.value === 'home' || isProviderMode.value);
const requestableRow = (key: string): boolean => REQUESTABLE_ROWS.has(key);
function retryRow(key: string): void {
  if (isProviderMode.value) retryProviderHome();
  else if (key === 'trending') void loadHomeGroup();
  else void loadHomeSection(key);
}
function openRow(key: string): void {
  if (key === 'genres') loadGenreRails();
}

return {
  query, mode, browsing, browse, retryRow, openRow, requestableRow,
  pageTitle, searchPlaceholder, isSourceMode, fixedMediaType,
  filterGroups, chips, activeFilterCount, resetFilters,
  personalized, hideAvailable, hideWatched, reloadPersonalized, loadPersonalized,
  sources, sourcesLoading, sourcesError, loadSources, sourcePath,
  home, GENRE_RAILS, loadHomeSection,
  displayedItems, totalResults, hasMore, loading, loadingMore, error, loadMore, reload, availability,
  requesting, requestError, requestSuccess, requestMedia, optionsDialog, confirmOptions, cancelOptions,
  detailPath, cardActionLabel, canRequest,
};
}
