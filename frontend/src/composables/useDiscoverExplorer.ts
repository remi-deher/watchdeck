import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { mediaRequestKey, useDirectMediaRequest } from '@/composables/useDirectMediaRequest';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { useDiscoverHome } from '@/composables/discover/useDiscoverHome';
import { useDiscoverCatalog } from '@/composables/discover/useDiscoverCatalog';
import { useDiscoverFilterGroups } from '@/composables/discover/useDiscoverFilterGroups';
import {
  AVAILABILITY_VALUES, EXPLORE_PATHS, GENRE_RAILS, SORT_VALUES, VALID_SECTIONS,
  canRequest, cardActionLabel, catalogEndpoint, detailPath, explorePathFor, fixedMediaTypeFor, mediaTypeFromLocation,
} from '@/composables/discover/discoverRules';

/**
 * Donnees et etat d'Explorer (gabarits Parcourir et Explorer) : accueil et page d'un
 * diffuseur en rangees (`useDiscoverHome`), catalogue en grille filtree
 * (`useDiscoverCatalog`), demandes de media. Les filtres sont portes par l'adresse. La
 * page n'en tire que de quoi afficher.
 */
export function useDiscoverExplorer() {
const initialParams = new URLSearchParams(window.location.search);
const route = useRoute();
const router = useRouter();
function initialModeFromLocation(): 'home' | 'explore' {
  if (
    EXPLORE_PATHS.includes(window.location.pathname) ||
    window.location.pathname.startsWith('/discover/source/') ||
    initialParams.get('mode') === 'explore'
  ) return 'explore';
  return 'home';
}
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
const mediaType = ref(mediaTypeFromLocation(initialParams, window.location.pathname));
const section = ref(VALID_SECTIONS.has(initialParams.get('section') || '') ? initialParams.get('section') as string : 'trending');
const genre = ref(initialParams.get('genre') || '');
const availability = ref(AVAILABILITY_VALUES.includes(initialParams.get('availability') || '') ? initialParams.get('availability') as string : '');
const sourceKey = ref(initialParams.get('source') || (window.location.pathname.startsWith('/discover/source/') ? window.location.pathname.replace('/discover/source/', '').replace('/', ':') : ''));
const sortBy = ref(initialParams.get('sort') || 'popularity.desc');
const genres = ref<any[]>([]);

const isSourceMode = computed(() => Boolean(sourceKey.value || route.path.startsWith('/discover/source/')));
/* Le diffuseur courant : celui du filtre, ou celui de la page de diffuseur ouverte. */
const currentSourceKey = computed(() => sourceKey.value || (route.params.kind && route.params.id ? `${route.params.kind}:${route.params.id}` : ''));
const activeSourceKind = computed(() => (currentSourceKey.value ? currentSourceKey.value.split(':')[0] : ''));
const fixedMediaType = computed(() => fixedMediaTypeFor(route.path));
const isProviderMode = computed(() => !fixedMediaType.value && isSourceMode.value && activeSourceKind.value === 'provider');

const {
  home, personalized, homeLoaded, hideAvailable, hideWatched,
  sources, sourcesLoading, sourcesError, activeSourceName,
  loadHome, loadHomeSection, loadSources, loadPersonalized, reloadPersonalized,
  loadProviderHome, forgetProviderHome,
  browse, retryRow, openRow, requestableRow, patchMedia: patchHome,
} = useDiscoverHome({ currentSourceKey, sourceKey, isProviderMode });

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

/* Le decompte du pied du tiroir. Les filtres s'appliquent a la volee ici : `totalResults`
   suit donc la selection en cours, il n'y a pas d'etat « en attente » a prevoir. Hors du
   mode explorateur il ne veut rien dire -- l'accueil n'est pas une liste filtree -- et le
   pied retombe alors sur un libelle generique plutot que d'afficher zero. */
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
      genre.value = '';
      section.value = 'trending';
      await loadGenres();
      if (mode.value === 'explore') {
        await reload();
      }
    },
  }
);
const {
  displayedItems, totalResults, hasMore, loading, loadingMore, error,
  load, reload, loadMore, abortCatalog, scheduleSearch, patchMedia: patchCatalog,
} = useDiscoverCatalog({
  firstPageUrl: () => catalogEndpoint({
    query: query.value, mediaType: mediaType.value, sortBy: sortBy.value,
    sourceKey: sourceKey.value, section: section.value, genre: genre.value,
  }, 1),
  syncUrl: syncExplorerUrl,
  availability,
});
const { requesting, requestError, requestSuccess, requestMedia, optionsDialog, confirmOptions, cancelOptions } = useDirectMediaRequest({ onUpdated: updateMatchingMedia });

function updateMatchingMedia(changed: any, update: any) {
  const key = mediaRequestKey(changed);
  patchCatalog(key, update);
  // Accueil et recommandations sont un etat local de la page, pas le cache.
  patchHome(key, update);
}
function sourcePath(source: any) {
  return {
    path: `/discover/source/${source.kind}/${source.id}`,
    query: { name: source.name, ...(fixedMediaType.value ? { type: fixedMediaType.value } : {}) },
  };
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
  const resolved = router.resolve(target).fullPath;
  if (route.fullPath === resolved || decodeURIComponent(route.fullPath) === decodeURIComponent(resolved)) return;
  selfWrittenUrl = resolved;
  void router.replace(target);
}
function syncExplorerUrl() {
  if (mode.value !== 'explore') return;
  const params = new URLSearchParams();
  if (query.value.trim()) params.set('q', query.value.trim());
  if (!fixedMediaType.value && mediaType.value !== 'all') params.set('type', mediaType.value);
  if (!isSourceMode.value && section.value !== 'trending' && !genre.value) params.set('section', section.value);
  if (genre.value) params.set('genre', genre.value);
  if (availability.value) params.set('availability', availability.value);
  if (sortBy.value && sortBy.value !== 'popularity.desc') params.set('sort', sortBy.value);

  if (route.path.startsWith('/discover/source/')) {
    if (activeSourceName.value && activeSourceName.value !== 'Diffuseur') params.set('name', activeSourceName.value);
    replaceExplorerUrl({ path: route.path, query: Object.fromEntries(params.entries()) });
    return;
  }

  if (sourceKey.value) params.set('source', sourceKey.value);
  replaceExplorerUrl({ path: explorePathFor(fixedMediaType.value), query: Object.fromEntries(params.entries()) });
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
    sortBy.value = SORT_VALUES.includes(String(route.query.sort)) ? String(route.query.sort) : 'popularity.desc';
    availability.value = AVAILABILITY_VALUES.includes(String(route.query.availability)) ? String(route.query.availability) : '';
    if (!sources.value.length) loadSources();
    if (kind === 'provider' && !route.query.type && !route.query.q && !route.query.genre && !route.query.section) {
      loadProviderHome(Number(id));
    } else {
      load();
    }
    return;
  }
  if (!EXPLORE_PATHS.includes(route.path)) return;
  const params = new URLSearchParams(route.query as Record<string, string>);
  mode.value = 'explore';
  assignQuery(params.get('q') || '');
  mediaType.value = mediaTypeFromLocation(params, route.path);
  genre.value = params.get('genre') || '';
  if (genre.value) {
    section.value = 'genres';
  } else {
    section.value = VALID_SECTIONS.has(params.get('section') || '') ? (params.get('section') as string) : 'trending';
  }
  availability.value = AVAILABILITY_VALUES.includes(params.get('availability') || '') ? (params.get('availability') as string) : '';
  sourceKey.value = params.get('source') || '';
  sortBy.value = SORT_VALUES.includes(params.get('sort') || '') ? (params.get('sort') as string) : 'popularity.desc';
  loadGenres();
  if (!sources.value.length) loadSources();
  load();
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
  forgetProviderHome(); // Forcer un rechargement si on change de provider
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
  if (genre.value) {
    section.value = 'genres';
  }
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

onMounted(() => {
  if (mode.value === 'home') loadHome();
  else if (mode.value === 'explore') showExplorer();
});
watch(() => [route.path, route.query.type, route.query.section, route.query.genre, route.query.availability, route.query.source, route.query.sort, route.query.q], ([path], [prevPath]) => {
  // La recherche d'accueil change seulement l'URL : le même champ et les mêmes
  // résultats restent montés, sans lancer une seconde requête ni perdre le focus.
  if (prevPath === '/discover' && path === '/discover/explore' && mode.value === 'explore' && query.value) return;
  // Mise a jour ecrite par la page elle-meme : son chargement est deja programme.
  if (selfWrittenUrl && (route.fullPath === selfWrittenUrl || decodeURIComponent(route.fullPath) === decodeURIComponent(selfWrittenUrl))) {
    selfWrittenUrl = '';
    return;
  }
  applyExplorerUrl();
});

watch(query, (value) => {
  if (value === queryFromCode) return;
  handleSearchInput();
});

/* Filtres : des definitions (donnees), rendues par le meme composant que les autres pages. */
const { filterGroups, chips } = useDiscoverFilterGroups(
  { query, mediaType, section, genre, availability, sourceKey, sortBy, genres, sources, isSourceMode, fixedMediaType },
  { setSection, setMediaType, setSort, setAvailability, setGenre, selectSource },
);

/** Parcourir quand rien n'est filtre ni cherche ; sinon Explorer. */
const browsing = computed(() => mode.value === 'home' || isProviderMode.value);

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
