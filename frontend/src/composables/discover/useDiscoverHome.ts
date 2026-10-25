import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api';
import { readCache, writeCache } from '@/cache';
import { mediaRequestKey } from '@/composables/useDirectMediaRequest';
import { usePreference } from '@/composables/usePreference';
import { GENRE_RAILS, PROVIDER_GENRE_RAILS, REQUESTABLE_ROWS, posterRow } from './discoverRules';

const PERSONALIZED_RAILS = ['recommended', 'preferred_genres', 'unwatched_popular', 'followed_series'];
const PROVIDER_SECTIONS = ['hero', 'movies', 'shows', 'genre_action', 'genre_scifi', 'genre_animation', 'genre_comedy', 'genre_thriller', 'genre_horror'];
const DISCOVER_HOME_CACHE_KEY = 'discover:home:sections:v1';
const DISCOVER_PERSO_CACHE_KEY = 'discover:home:perso:v1';
const DISCOVER_CACHE_MAX_AGE_MS = 30 * 60_000;

function emptyPersonalizedRail() {
  return { items: [] as any[] };
}
function sectionState() {
  return { item: null as any, items: [] as any[], loading: true, error: '' };
}
function emptySourceSection() {
  return { items: [] as any[], loading: false, error: '' };
}

interface DiscoverHomeOptions {
  /** Diffuseur courant (`kind:id`), par le filtre ou par l'adresse de sa page. */
  currentSourceKey: ComputedRef<string>;
  sourceKey: Ref<string>;
  isProviderMode: ComputedRef<boolean>;
}

/**
 * Vues a parcourir d'Explorer (gabarit Parcourir) : accueil, recommandations et page d'un
 * diffuseur, en rangees, avec la liste des diffuseurs. Etat local de la page, hors cache.
 */
export function useDiscoverHome({ currentSourceKey, sourceKey, isProviderMode }: DiscoverHomeOptions) {
const route = useRoute();
const sources = ref<any[]>([]);
const sourcesLoading = ref(true);
const sourcesError = ref('');
const homeLoaded = ref(false);
const hideAvailable = usePreference('discover.hideAvailable', false);
const hideWatched = usePreference('discover.hideWatched', false);

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

// Hydratation immédiate depuis le cache SWR (retour navigation à 0ms)
const cachedHome = readCache<Record<string, any>>(DISCOVER_HOME_CACHE_KEY, { maxAgeMs: DISCOVER_CACHE_MAX_AGE_MS });
if (cachedHome) {
  for (const [name, section] of Object.entries(cachedHome)) {
    if (home[name] && section) {
      home[name].item = section.item ?? null;
      home[name].items = Array.isArray(section.items) ? section.items : [];
      home[name].loading = false;
      home[name].error = '';
    }
  }
}

const cachedPerso = readCache<Record<string, any>>(DISCOVER_PERSO_CACHE_KEY, { maxAgeMs: DISCOVER_CACHE_MAX_AGE_MS });
if (cachedPerso) {
  personalized.available = Boolean(cachedPerso.available);
  personalized.seeds = Array.isArray(cachedPerso.seeds) ? cachedPerso.seeds : [];
  personalized.loading = false;
  personalized.error = '';
  for (const name of PERSONALIZED_RAILS) {
    if (personalized[name]) {
      personalized[name].items = Array.isArray(cachedPerso.sections?.[name]?.items)
        ? cachedPerso.sections[name].items
        : [];
    }
  }
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

const activeSourceName = computed(() => {
  if (route.query.name) return String(route.query.name);
  const currentKey = currentSourceKey.value;
  if (currentKey) {
    const [kind, id] = currentKey.split(':');
    const match = sources.value.find((s: any) => s.kind === kind && String(s.id) === String(id));
    if (match) return match.name;
  }
  return 'Diffuseur';
});

/* Liens « Voir tout » d'une rangee de diffuseur : l'explorateur deja regle sur lui. */
function sourceQuery(extra: Record<string, any>): Record<string, any> | undefined {
  const key = currentSourceKey.value;
  if (!key) return undefined;
  const q: Record<string, any> = { source: key, ...extra };
  if (activeSourceName.value && activeSourceName.value !== 'Diffuseur') q.name = activeSourceName.value;
  return q;
}
function sourceTypePath(type: string): { path: string; query: Record<string, any> } | undefined {
  const q = sourceQuery({});
  if (!q) return undefined;
  const path = type === 'movie' ? '/discover/movies' : type === 'show' ? '/discover/shows' : '/discover/explore';
  return { path, query: q };
}
function sourceGenrePath(genreId: string): { path: string; query: Record<string, any> } | undefined {
  const q = sourceQuery({ genre: genreId });
  return q && { path: '/discover/explore', query: q };
}

const INITIAL_HOME_SECTIONS = [
  'hero',
  'trending',
  'popular_movies',
  'popular_tv',
  'upcoming',
  'recent_plex',
  'most_requested',
];

async function loadHomeBatch(sectionNames: string[] = INITIAL_HOME_SECTIONS): Promise<void> {
  for (const name of sectionNames) {
    if (home[name]) {
      if (!home[name].items?.length && !home[name].item) {
        home[name].loading = true;
      }
      home[name].error = '';
    }
  }
  try {
    const payload = await api<{ sections: Record<string, any> }>(`/api/discover/home?sections=${sectionNames.join(',')}`);
    for (const name of sectionNames) {
      if (home[name] && payload.sections?.[name]) {
        Object.assign(home[name], payload.sections[name], {
          loading: false,
          error: payload.sections[name].error || '',
        });
      }
    }
    const currentSections: Record<string, any> = {};
    for (const [key, val] of Object.entries(home)) {
      if (val?.items?.length || val?.item) {
        currentSections[key] = { item: val.item, items: val.items };
      }
    }
    writeCache(DISCOVER_HOME_CACHE_KEY, currentSections);
  } catch (loadError: any) {
    for (const name of sectionNames) {
      if (home[name]) {
        home[name].error = loadError.message;
        home[name].loading = false;
      }
    }
  }
}

async function loadHomeGroup(): Promise<void> {
  await loadHomeBatch(['hero', 'trending']);
}

async function loadGenreRails(): Promise<void> {
  const genreKeys = GENRE_RAILS.map((rail) => rail.key);
  await loadHomeBatch(genreKeys);
}

async function loadHomeSection(name: string): Promise<void> {
  await loadHomeBatch([name]);
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
  void loadHomeBatch(INITIAL_HOME_SECTIONS);
  void loadSources();
  void loadPersonalized();
}

async function loadPersonalized() {
  if (!personalized.seeds?.length) {
    personalized.loading = true;
  }
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
    for (const name of PERSONALIZED_RAILS) {
      personalized[name].items = payload.sections?.[name]?.items || [];
    }
    writeCache(DISCOVER_PERSO_CACHE_KEY, {
      available: personalized.available,
      seeds: personalized.seeds,
      sections: Object.fromEntries(
        PERSONALIZED_RAILS.map((name) => [name, { items: personalized[name].items }])
      ),
    });
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

/** Oublier la page de diffuseur chargee : la prochaine demande la relit. */
function forgetProviderHome(): void {
  sourceHomeLoadedFor = '';
}
function retryProviderHome(): void {
  const [, id] = (sourceKey.value || '').split(':');
  if (id) loadProviderHome(Number(id));
}

async function loadProviderHome(providerId: number | string) {
  const key = String(providerId);
  if (sourceHomeLoadedFor === key) return; // Évite les rechargements inutiles lors de re-render
  sourceHomeLoadedFor = key;

  // Mettre toutes les sections en état "loading"
  for (const name of PROVIDER_SECTIONS) {
    sourceHome[name].loading = true;
    sourceHome[name].error = '';
    sourceHome[name].items = [];
  }

  try {
    const payload = await api(`/api/discover/source/provider/${providerId}/home?sections=${PROVIDER_SECTIONS.join(',')}`);
    const sections = payload.sections || {};
    for (const name of PROVIDER_SECTIONS) {
      const section = sections[name] || {};
      sourceHome[name].items = section.items || [];
      sourceHome[name].error = section.error || '';
      sourceHome[name].loading = false;
    }
  } catch (loadError: any) {
    for (const name of PROVIDER_SECTIONS) {
      sourceHome[name].error = loadError.message;
      sourceHome[name].loading = false;
    }
  }
}

/** Reporter une demande sur les cartes de l'accueil et des recommandations. */
function patchMedia(key: string, update: any): void {
  for (const state of Object.values(home) as any[]) {
    if (state.item && mediaRequestKey(state.item) === key) Object.assign(state.item, update);
    for (const item of state.items) if (mediaRequestKey(item) === key) Object.assign(item, update);
  }
  for (const name of PERSONALIZED_RAILS) {
    for (const item of personalized[name].items) if (mediaRequestKey(item) === key) Object.assign(item, update);
  }
}

/* Pages a parcourir (gabarit Parcourir) : accueil et page d'un diffuseur, en rangees. */
const personalizedShown = computed(() => personalized.loading || personalized.available || Boolean(personalized.error));
const homeRows = computed<any[]>(() => [
  { kind: 'section', key: 'sources' },
  posterRow('trending', 'Tendances aujourd’hui', home.trending, { path: '/discover/explore' }),
  ...(personalizedShown.value ? [{ kind: 'section', key: 'personalized' }] : []),
  posterRow('popular_movies', 'Films populaires', home.popular_movies, { path: '/discover/movies', query: { section: 'popular' } }),
  posterRow('popular_tv', 'Séries populaires', home.popular_tv, { path: '/discover/shows', query: { section: 'popular' } }),
  // Genres generiques : replies par defaut et charges a l'ouverture seulement (six appels evites a chaque affichage).
  { kind: 'collapsible', key: 'genres', title: 'Explorer par genre', eyebrow: 'Catalogue', storageKey: 'watchdeck.discoverGenresOpen' },
  posterRow('upcoming', 'Prochainement', home.upcoming, { path: '/discover/explore', query: { section: 'coming-soon' } }),
  posterRow('recent_plex', 'Ajouts récents dans Plex', home.recent_plex, { path: '/discover/explore', query: { availability: 'available' } }),
  ...(home.most_requested.loading || home.most_requested.items.length || home.most_requested.error
    ? [posterRow('most_requested', 'Les plus demandés', home.most_requested, { path: '/discover/explore', query: { availability: 'requested' } })]
    : []),
]);
const providerRows = computed<any[]>(() => [
  posterRow('movies', `Films sur ${activeSourceName.value}`, sourceHome.movies, sourceTypePath('movie')),
  posterRow('shows', `Séries sur ${activeSourceName.value}`, sourceHome.shows, sourceTypePath('show')),
  ...PROVIDER_GENRE_RAILS.map(rail => posterRow(rail.key, rail.title, sourceHome[rail.key], sourceGenrePath(rail.genre))),
]);
/** Banniere et rangees de la vue a parcourir : l'accueil, ou la page d'une plateforme. */
const browse = computed(() => (isProviderMode.value
  ? { hero: sourceHome.hero.items, heroLoading: sourceHome.hero.loading, heroEyebrow: `À la une sur ${activeSourceName.value}`, rows: providerRows.value }
  : { hero: home.hero.items, heroLoading: home.hero.loading, heroEyebrow: '', rows: homeRows.value }));
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
  home, personalized, homeLoaded, hideAvailable, hideWatched,
  sources, sourcesLoading, sourcesError, activeSourceName,
  loadHome, loadHomeSection, loadSources, loadPersonalized, reloadPersonalized,
  loadProviderHome, forgetProviderHome,
  browse, retryRow, openRow, requestableRow, patchMedia,
};
}
