<template>
  <div class="page">
    <PageSearchHeader
      :title="pageTitle"
      :description="pageDescription"
      v-model:query="query"
      :placeholder="searchPlaceholder"
      :hide-search="mode === 'requests'"
      has-filters
      :active-count="activeFilterCount"
      :filters-open="filtersOpen"
      @search="handleSearchInput"
      @toggle-filters="toggleFilters"
    />
    <div class="psh-layout">
      <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
        <FilterGroup v-if="!isSourceMode" label="Section">
          <button
            v-for="entry in sections"
            :key="entry.value"
            class="filter-badge"
            :class="{ active: section === entry.value && !query }"
            @click="setSection(entry.value)"
          ><span>{{ entry.label }}</span></button>
        </FilterGroup>

        <FilterGroup v-if="!fixedMediaType" label="Type de média">
          <button
            v-for="entry in availableMediaTypes"
            :key="entry.value"
            class="filter-badge"
            :class="{ active: mediaType === entry.value }"
            @click="setMediaType(entry.value)"
          ><span>{{ entry.label }}</span></button>
        </FilterGroup>

        <FilterGroup v-if="isSourceMode" label="Tri">
          <button class="filter-badge" :class="{ active: sortBy === 'popularity.desc' }" @click="setSort('popularity.desc')"><span>Plus populaires</span></button>
          <button class="filter-badge" :class="{ active: sortBy === 'primary_release_date.desc' }" @click="setSort('primary_release_date.desc')"><span>Plus récents</span></button>
          <button class="filter-badge" :class="{ active: sortBy === 'vote_average.desc' }" @click="setSort('vote_average.desc')"><span>Mieux notés</span></button>
        </FilterGroup>

        <FilterGroup label="Disponibilité">
          <button class="filter-badge" :class="{ active: !availability }" @click="setAvailability('')"><span>Tous les états</span></button>
          <button class="filter-badge" :class="{ active: availability === 'available' }" @click="setAvailability('available')"><span>Dans Plex</span></button>
          <button class="filter-badge" :class="{ active: availability === 'requested' }" @click="setAvailability('requested')"><span>Déjà demandé</span></button>
          <button class="filter-badge" :class="{ active: availability === 'new' }" @click="setAvailability('new')"><span>À demander</span></button>
        </FilterGroup>

        <FilterGroup v-if="genres.length" label="Genre">
          <button class="filter-badge" :class="{ active: !genre }" @click="setGenre('')"><span>Tous</span></button>
          <button
            v-for="entry in genres"
            :key="entry.id"
            class="filter-badge"
            :class="{ active: String(genre) === String(entry.id) }"
            @click="setGenre(String(entry.id))"
          ><span>{{ entry.name }}</span></button>
        </FilterGroup>

        <FilterGroup v-if="sources.length" label="Diffuseur / Studio">
          <button class="filter-badge" :class="{ active: !sourceKey }" @click="sourceKey = ''; selectSource()"><span>Tous</span></button>
          <button
            v-for="source in sources"
            :key="`${source.kind}:${source.id}`"
            class="filter-badge"
            :class="{ active: sourceKey === `${source.kind}:${source.id}` }"
            @click="sourceKey = sourceKey === `${source.kind}:${source.id}` ? '' : `${source.kind}:${source.id}`; selectSource()"
          ><span>{{ source.name }}</span></button>
        </FilterGroup>
      </FilterSidebar>
      <div class="psh-main">
    <!-- Contenu principal -->
    <div class="discover-body">
      <UiFeedback v-if="requestError" type="error" :message="requestError" dismissible @dismiss="requestError=''" />
      <UiFeedback v-if="requestSuccess" type="success" :message="requestSuccess" dismissible @dismiss="requestSuccess=''" />

    <Transition name="discover-mode" mode="out-in">
      <div v-if="mode === 'home'" key="home" class="discover-home-view">
        <MediaHeroBanner :items="home.hero.items" :loading="home.hero.loading" />
        <UiFeedback v-if="home.hero.error" type="error" :message="home.hero.error" retry @retry="loadHomeGroup" />

        <div class="discover-home-rails">
          <DiscoverSourcesRail
            title="Plateformes de streaming & studios"
            heading-id="sources-heading"
            :sources="sources"
            :source-path="sourcePath"
            :loading="sourcesLoading"
            :error="sourcesError"
            @retry="loadSources"
          />

          <MediaRail
            title="Tendances aujourd’hui"
            :more-to="{ path: '/discover/explore' }"
            :items="home.trending.items"
            :loading="home.trending.loading"
            :error="home.trending.error"
            allow-request
            :requesting="requesting"
            @retry="loadHomeGroup"
            @request="requestMedia"
          />

          <section v-if="personalized.loading || personalized.available || personalized.error" class="personalized-discovery" aria-labelledby="personalized-heading">
            <header class="personalized-header">
              <div>
                <span class="eyebrow">Selon votre historique Plex</span>
                <h2 id="personalized-heading">Pour vous</h2>
                <p v-if="personalized.seeds.length">Inspiré par {{ personalized.seeds.map((item: any) => item.title).join(', ') }}</p>
              </div>
              <div class="personalized-options" aria-label="Préférences de recommandation">
                <label><input v-model="hideAvailable" type="checkbox" @change="reloadPersonalized"> Masquer les médias dans Plex</label>
                <label><input v-model="hideWatched" type="checkbox" @change="reloadPersonalized"> Masquer les médias déjà vus</label>
              </div>
            </header>
            <UiFeedback v-if="personalized.error" type="error" :message="personalized.error" retry @retry="loadPersonalized" />
            <MediaRail
              v-else
              title="Parce que vous avez regardé…"
              :items="personalized.recommended.items"
              :loading="personalized.loading"
              allow-request
              :requesting="requesting"
              @request="requestMedia"
            />
            <MediaRail
              v-if="personalized.preferred_genres.items.length"
              title="Dans vos genres préférés"
              :items="personalized.preferred_genres.items"
              allow-request
              :requesting="requesting"
              @request="requestMedia"
            />
            <MediaRail
              v-if="personalized.unwatched_popular.items.length"
              title="Populaires et jamais vus"
              :items="personalized.unwatched_popular.items"
              allow-request
              :requesting="requesting"
              @request="requestMedia"
            />
            <MediaRail
              v-if="personalized.followed_series.items.length"
              title="Nouveaux épisodes de vos séries suivies"
              :items="personalized.followed_series.items"
              allow-request
              :requesting="requesting"
              @request="requestMedia"
            />
          </section>
          <MediaRail
            title="Films populaires"
            :more-to="{ path: '/discover/movies', query: { section: 'popular' } }"
            :items="home.popular_movies.items"
            :loading="home.popular_movies.loading"
            :error="home.popular_movies.error"
            allow-request
            :requesting="requesting"
            @retry="loadHomeSection('popular_movies')"
            @request="requestMedia"
          />
          <MediaRail
            title="Séries populaires"
            :more-to="{ path: '/discover/shows', query: { section: 'popular' } }"
            :items="home.popular_tv.items"
            :loading="home.popular_tv.loading"
            :error="home.popular_tv.error"
            allow-request
            :requesting="requesting"
            @retry="loadHomeSection('popular_tv')"
            @request="requestMedia"
          />

          <!-- Genres generiques : replies par defaut et charges a l'ouverture seulement.
               Six rails identiques pour tous les utilisateurs poussaient le contenu a
               forte valeur (Pour vous, Ajouts recents) tres bas, et coutaient six
               appels API a chaque affichage de l'accueil. -->
          <details class="discover-genre-explorer" :open="genresOpen" @toggle="onGenresToggle">
            <summary>
              <div>
                <span class="eyebrow">Catalogue</span>
                <strong>Explorer par genre</strong>
              </div>
              <ChevronDown aria-hidden="true" />
            </summary>
            <div v-if="genresLoaded" class="discover-genre-rails">
              <MediaRail
                v-for="rail in GENRE_RAILS"
                :key="rail.key"
                :title="rail.title"
                :more-to="{ path: '/discover/explore', query: { genre: rail.genre } }"
                :items="home[rail.key].items"
                :loading="home[rail.key].loading"
                :error="home[rail.key].error"
                allow-request
                :requesting="requesting"
                @retry="loadHomeSection(rail.key)"
                @request="requestMedia"
              />
            </div>
          </details>

          <MediaRail
            title="Prochainement"
            :more-to="{ path: '/discover/explore', query: { section: 'coming-soon' } }"
            :items="home.upcoming.items"
            :loading="home.upcoming.loading"
            :error="home.upcoming.error"
            allow-request
            :requesting="requesting"
            @retry="loadHomeSection('upcoming')"
            @request="requestMedia"
          />
          <MediaRail
            title="Ajouts récents dans Plex"
            :more-to="{ path: '/discover/explore', query: { availability: 'available' } }"
            :items="home.recent_plex.items"
            :loading="home.recent_plex.loading"
            :error="home.recent_plex.error"
            :requesting="requesting"
            @retry="loadHomeSection('recent_plex')"
          />
          <MediaRail
            v-if="home.most_requested.loading || home.most_requested.items.length || home.most_requested.error"
            title="Les plus demandés"
            :more-to="{ path: '/discover/explore', query: { availability: 'requested' } }"
            :items="home.most_requested.items"
            :loading="home.most_requested.loading"
            :error="home.most_requested.error"
            :requesting="requesting"
            @retry="loadHomeSection('most_requested')"
          />

        </div>
      </div>

      <div v-else-if="mode === 'explore'" :key="isSourceMode ? `source-${sourceKey}` : 'explore'" class="discover-explore-view">

        <!-- ── Mode Provider SVOD : layout rails identique à l'accueil ── -->
        <template v-if="isProviderMode">
          <MediaHeroBanner
            v-if="sourceHome.hero.items.length || sourceHome.hero.loading"
            :items="sourceHome.hero.items"
            :loading="sourceHome.hero.loading"
            :eyebrow="`À la une sur ${activeSourceName}`"
          />
          <UiFeedback v-if="sourceHome.hero.error" type="error" :message="sourceHome.hero.error" />

          <div class="discover-home-rails">
            <MediaRail
              :title="`Films sur ${activeSourceName}`"
              :more-to="sourceTypePath('movie')"
              :items="sourceHome.movies.items"
              :loading="sourceHome.movies.loading"
              :error="sourceHome.movies.error"
              allow-request
              :requesting="requesting"
              @retry="retryProviderHome"
              @request="requestMedia"
            />
            <MediaRail
              :title="`Séries sur ${activeSourceName}`"
              :more-to="sourceTypePath('show')"
              :items="sourceHome.shows.items"
              :loading="sourceHome.shows.loading"
              :error="sourceHome.shows.error"
              allow-request
              :requesting="requesting"
              @retry="retryProviderHome"
              @request="requestMedia"
            />
            <MediaRail
              title="Action & Aventure"
              :more-to="sourceGenrePath('28')"
              :items="sourceHome.genre_action.items"
              :loading="sourceHome.genre_action.loading"
              :error="sourceHome.genre_action.error"
              allow-request
              :requesting="requesting"
              @retry="retryProviderHome"
              @request="requestMedia"
            />
            <MediaRail
              title="Science-Fiction & Fantastique"
              :more-to="sourceGenrePath('878')"
              :items="sourceHome.genre_scifi.items"
              :loading="sourceHome.genre_scifi.loading"
              :error="sourceHome.genre_scifi.error"
              allow-request
              :requesting="requesting"
              @retry="retryProviderHome"
              @request="requestMedia"
            />
            <MediaRail
              title="Animation"
              :more-to="sourceGenrePath('16')"
              :items="sourceHome.genre_animation.items"
              :loading="sourceHome.genre_animation.loading"
              :error="sourceHome.genre_animation.error"
              allow-request
              :requesting="requesting"
              @retry="retryProviderHome"
              @request="requestMedia"
            />
            <MediaRail
              title="Comédies"
              :more-to="sourceGenrePath('35')"
              :items="sourceHome.genre_comedy.items"
              :loading="sourceHome.genre_comedy.loading"
              :error="sourceHome.genre_comedy.error"
              allow-request
              :requesting="requesting"
              @retry="retryProviderHome"
              @request="requestMedia"
            />
            <MediaRail
              title="Thrillers & Policiers"
              :more-to="sourceGenrePath('53')"
              :items="sourceHome.genre_thriller.items"
              :loading="sourceHome.genre_thriller.loading"
              :error="sourceHome.genre_thriller.error"
              allow-request
              :requesting="requesting"
              @retry="retryProviderHome"
              @request="requestMedia"
            />
            <MediaRail
              title="Horreur & Mystère"
              :more-to="sourceGenrePath('27')"
              :items="sourceHome.genre_horror.items"
              :loading="sourceHome.genre_horror.loading"
              :error="sourceHome.genre_horror.error"
              allow-request
              :requesting="requesting"
              @retry="retryProviderHome"
              @request="requestMedia"
            />
          </div>
        </template>

        <!-- ── Mode Network / Company ou recherche : grille plate ── -->
        <template v-else>
          <MediaHeroBanner
            v-if="isSourceMode && displayedItems.length"
            :items="displayedItems.slice(0, 5)"
            :eyebrow="`À la une sur ${activeSourceName}`"
          />

          <DiscoverSourcesRail
            v-if="fixedMediaType && !query && !isSourceMode"
            title="Diffuseurs & studios"
            heading-id="catalog-sources-heading"
            :sources="sources"
            :source-path="sourcePath"
            :loading="sourcesLoading"
            :error="sourcesError"
            :skeleton-count="5"
            @retry="loadSources"
          />

          <div v-if="!isSourceMode" class="discover-heading">
            <div class="discover-heading-main">
              <span class="eyebrow">{{ query ? 'Résultats' : sectionLabel }}</span>
              <h2>{{ query ? `Recherche « ${query.trim()} »` : sectionDescription }}</h2>
            </div>
            <div class="discover-heading-meta">
              <span class="meta-pill" aria-live="polite">
                <strong>{{ displayedItems.length }}</strong> affiché{{ displayedItems.length > 1 ? 's' : '' }}<template v-if="totalResults"> / {{ totalResults }}</template>
              </span>
            </div>
          </div>

          <MediaPosterCollection
            :items="displayedItems"
            :loading="loading"
            :loading-more="loadingMore"
            :has-more="hasMore"
            :error="error"
            empty-message="Aucun média ne correspond à ces filtres."
            @load-more="loadMore"
            @retry="reload"
          >
            <MediaPosterCard
              v-for="(item, index) in displayedItems"
              :key="mediaRequestKey(item)"
              :style="{ '--card-index': index % 20 }"
              :to="detailPath(item)"
              :item="item"
              :action-label="cardActionLabel(item)"
              :requestable="canRequest(item)"
              :request-busy="requesting.includes(mediaRequestKey(item))"
              @request="requestMedia"
            />
          </MediaPosterCollection>
        </template>
      </div>

      <div v-else-if="mode === 'requests'" key="requests" class="discover-requests-view">
        <MyRequestsPanel @explore="showExplorer" />
      </div>
    </Transition>

      <RequestOptionsModal
        :open="optionsDialog.open"
        :media-title="optionsDialog.item ? (optionsDialog.item.title || optionsDialog.item.name) : ''"
        :requesters="optionsDialog.requesters"
        :folders="optionsDialog.folders"
        :plex-user-id="optionsDialog.plexUserId"
        :root-folder="optionsDialog.rootFolder"
        :busy="optionsDialog.busy"
        @update:plex-user-id="v => optionsDialog.plexUserId = v"
        @update:root-folder="v => optionsDialog.rootFolder = v"
        @cancel="cancelOptions"
        @confirm="confirmOptions"
      />
    </div><!-- .discover-body -->
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ArrowRight, ChevronDown } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import MediaHeroBanner from '@/components/media/MediaHeroBanner.vue';
import DiscoverSourcesRail from '@/components/discover/DiscoverSourcesRail.vue';
import MediaPosterCard from '@/components/media/MediaPosterCard.vue';
import MediaRail from '@/components/discover/MediaRail.vue';
import MediaPosterCollection from '@/components/media/MediaPosterCollection.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import RequestOptionsModal from '@/components/media/RequestOptionsModal.vue';
import MyRequestsPanel from '@/components/discover/MyRequestsPanel.vue';
import { useDebounced } from '@/composables/useDebounced';
import { mediaRequestKey, useDirectMediaRequest } from '@/composables/useDirectMediaRequest';
import { useLatestRequest } from '@/composables/useLatestRequest';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { mediaDetailPath } from '@/mediaUrl';

const initialParams = new URLSearchParams(window.location.search);
const route = useRoute();
const router = useRouter();
function initialModeFromLocation(): string {
  if (window.location.pathname === '/discover/requests' || initialParams.get('mode') === 'requests') return 'requests';
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
const mode = ref(initialModeFromLocation());
const items = ref<any[]>([]);
const query = ref(initialParams.get('q') || '');
const mediaType = ref(mediaTypeFromLocation(initialParams));
const section = ref(validSections.has(initialParams.get('section') || '') ? initialParams.get('section') as string : 'trending');
const genre = ref(initialParams.get('genre') || '');
const availability = ref(['available', 'requested', 'new'].includes(initialParams.get('availability') || '') ? initialParams.get('availability') as string : '');
const sourceKey = ref(initialParams.get('source') || (window.location.pathname.startsWith('/discover/source/') ? window.location.pathname.replace('/discover/source/', '').replace('/', ':') : ''));
const sortBy = ref(initialParams.get('sort') || 'popularity.desc');
const genres = ref<any[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const page = ref(1);
const totalPages = ref(1);
const totalResults = ref(0);
const request = useLatestRequest();
const sources = ref<any[]>([]);
const sourcesLoading = ref(true);
const sourcesError = ref('');
const homeLoaded = ref(false);
const hideAvailable = ref(localStorage.getItem('discover.hideAvailable') === 'true');
const hideWatched = ref(localStorage.getItem('discover.hideWatched') === 'true');

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
  if (mode.value === 'requests') return 'Demandes';
  if (isSourceMode.value) return activeSourceName.value;
  if (fixedMediaType.value === 'movie') return 'Films';
  if (fixedMediaType.value === 'show') return 'Séries';
  return 'Découvrir';
});

const pageDescription = computed(() => {
  if (mode.value === 'requests') return 'Suivez vos demandes et leur disponibilité.';
  if (isSourceMode.value) {
    const kind = sourceKey.value ? sourceKey.value.split(':')[0] : (route.params.kind || '');
    if (kind === 'provider') return `Explorez tous les films et séries disponibles sur ${activeSourceName.value}.`;
    if (kind === 'network') return `Toutes les séries et productions diffusées par ${activeSourceName.value}.`;
    if (kind === 'company') return `Tous les films, séries et productions de ${activeSourceName.value}.`;
    return `Sélection de médias pour ${activeSourceName.value}.`;
  }
  if (fixedMediaType.value === 'movie') return 'Explorez les films et trouvez votre prochaine séance.';
  if (fixedMediaType.value === 'show') return 'Parcourez les séries à suivre et les nouveautés.';
  return '';
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

const { filtersOpen, activeCount: activeFilterCount, toggle: toggleFilters, close: closeFilters, reset: resetFiltersDrawer } = useFiltersDrawer(
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
  if (availability.value === 'available') return item.available || item.in_library;
  if (availability.value === 'requested') return item.requested && !item.available && !item.in_library;
  if (availability.value === 'new') return !item.requested && !item.available && !item.in_library;
  return true;
}));
const hasMore = computed(() => page.value < totalPages.value);
const { requesting, requestError, requestSuccess, requestMedia, optionsDialog, confirmOptions, cancelOptions } = useDirectMediaRequest({ onUpdated: updateMatchingMedia });

function updateMatchingMedia(changed: any, update: any) {
  const key = mediaRequestKey(changed);
  for (const item of items.value) if (mediaRequestKey(item) === key) Object.assign(item, update);
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
  request.abort();
  mode.value = 'home';
  router.push('/discover');
  if (!homeLoaded.value) loadHome();
}
async function showExplorer() {
  mode.value = 'explore';
  if (route.path === '/discover/requests') {
    await router.push('/discover/movies');
    return;
  }
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
    router.replace({ path: route.path, query: Object.fromEntries(params.entries()) });
    return;
  }

  if (sourceKey.value) params.set('source', sourceKey.value);
  const path = fixedMediaType.value === 'movie' ? '/discover/movies' : fixedMediaType.value === 'show' ? '/discover/shows' : '/discover/explore';
  router.replace({ path, query: Object.fromEntries(params.entries()) });
}

function applyExplorerUrl() {
  if (route.path === '/discover/requests') {
    request.abort();
    mode.value = 'requests';
    return;
  }
  if (route.path === '/discover') {
    request.abort();
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
    query.value = String(route.query.q || '');
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
  query.value = params.get('q') || '';
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
const GENRES_OPEN_KEY = 'watchdeck.discoverGenresOpen';
const genresOpen = ref(localStorage.getItem(GENRES_OPEN_KEY) === '1');
const genresLoaded = ref(false);

function loadGenreRails(): void {
  if (genresLoaded.value) return;
  genresLoaded.value = true;
  for (const rail of GENRE_RAILS) loadHomeSection(rail.key);
}

function onGenresToggle(event: Event): void {
  const open = (event.target as HTMLDetailsElement).open;
  genresOpen.value = open;
  try {
    localStorage.setItem(GENRES_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* Preference non persistable */
  }
  if (open) loadGenreRails();
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
  if (genresOpen.value) loadGenreRails();
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
  localStorage.setItem('discover.hideAvailable', String(hideAvailable.value));
  localStorage.setItem('discover.hideWatched', String(hideWatched.value));
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
  query.value = '';
  genre.value = '';
  sourceKey.value = '';
  reload();
}
function selectSource() {
  if (mode.value !== 'explore') mode.value = 'explore';
  query.value = '';
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
async function load({ append = false } = {}) {
  syncExplorerUrl();
  const targetPage = append ? page.value + 1 : 1;
  const { signal, isCurrent } = append ? request.extend() : request.begin();
  if (append) loadingMore.value = true;
  else loading.value = true;
  error.value = '';
  try {
    const payload = await api(endpoint(targetPage), { signal });
    if (!isCurrent()) return;
    const incoming = payload.items || [];
    if (append) {
      const known = new Set(items.value.map(mediaRequestKey));
      items.value = [...items.value, ...incoming.filter((item: any) => !known.has(mediaRequestKey(item)))];
    } else {
      items.value = incoming;
    }
    page.value = payload.page || targetPage;
    totalPages.value = payload.total_pages || 1;
    totalResults.value = payload.total_results || incoming.length;
  } catch (loadError: any) {
    if (!request.isAbort(loadError) && isCurrent()) {
      error.value = loadError.message;
      if (!append) items.value = [];
    }
  } finally {
    if (isCurrent()) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}
function reload() { return load(); }
function loadMore() { if (!loadingMore.value && hasMore.value) load({ append: true }); }
const debouncedReload = useDebounced(reload, 300);
function scheduleSearch() {
  request.abort();
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
  applyExplorerUrl();
});
</script>

<style scoped lang="scss">
.discover-body { display: grid; gap: var(--space-5); }
.discover-home-view,
.discover-explore-view { display: grid; gap: var(--space-6); }

/* ─── Contenu ─── */
.discover-home-rails { display: grid; gap: var(--space-6); }
.personalized-discovery { display: grid; gap: var(--space-5); padding: 20px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--surface) 92%, var(--accent) 8%); }
.personalized-header { display: flex; align-items: start; justify-content: space-between; gap: var(--space-4); }
.personalized-header h2 { margin: 2px 0 0; font-size: var(--fs-xl); }
.personalized-header p { max-width: 680px; margin: 5px 0 0; color: var(--muted); font-size: var(--fs-sm); }
.personalized-options { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.personalized-options label { display: flex; align-items: center; gap: var(--space-2); color: var(--muted); font-size: var(--fs-sm); cursor: pointer; }
.personalized-options input { accent-color: var(--accent); }
.discover-sections { display: flex; align-items: center; gap: var(--space-1); overflow-x: auto; scrollbar-width: none; }
.discover-sections button { padding: 6px 10px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--muted); white-space: nowrap; }
.discover-sections button.active { background: var(--accent); color: #111; }
.discover-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  margin-top: var(--space-6);
  margin-bottom: var(--space-4);
}
.discover-heading-main {
  display: grid;
  gap: var(--space-1);
}
.discover-heading-main .eyebrow {
  color: var(--accent);
  font-size: var(--fs-xs);
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.discover-heading-main h2 {
  margin: 0;
  color: var(--text);
  font-size: var(--fs-xl);
  font-weight: 800;
  line-height: 1.2;
}
.discover-heading-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
.discover-heading-meta .meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
}
.discover-heading-meta .meta-pill strong {
  color: var(--text);
}
.discover-grid { align-items: start; }

/* ─── Transitions de Mode Découvrir (Fluid Crossfade) ─── */
.discover-mode-enter-active,
.discover-mode-leave-active {
  transition: opacity 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: opacity, transform;
}
.discover-mode-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.995);
}
.discover-mode-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.995);
}

/* ─── Cascade d'apparition des rails de l'accueil ─── */
@keyframes rail-reveal {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.discover-home-rails > * {
  animation: rail-reveal 0.35s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
.discover-home-rails > *:nth-child(1) { animation-delay: 30ms; }
.discover-home-rails > *:nth-child(2) { animation-delay: 60ms; }
.discover-home-rails > *:nth-child(3) { animation-delay: 90ms; }
.discover-home-rails > *:nth-child(4) { animation-delay: 120ms; }
.discover-home-rails > *:nth-child(5) { animation-delay: 150ms; }
.discover-home-rails > *:nth-child(6) { animation-delay: 180ms; }
.discover-home-rails > *:nth-child(7) { animation-delay: 210ms; }
.discover-home-rails > *:nth-child(8) { animation-delay: 240ms; }
.discover-home-rails > *:nth-child(9) { animation-delay: 270ms; }
.discover-home-rails > *:nth-child(10) { animation-delay: 300ms; }

@media (prefers-reduced-motion: reduce) {
  .discover-mode-enter-active,
  .discover-mode-leave-active {
    transition: opacity 0.15s ease;
    transform: none !important;
  }
  .discover-home-rails > * {
    animation: none;
  }
}

@media (max-width: 767.98px) {
  .discover-heading {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  .discover-heading-main h2 {
    font-size: var(--fs-lg);
  }
  .personalized-discovery { padding: 14px; }
  .personalized-header { display: grid; }
  .personalized-options { display: grid; }
  .discover-heading-meta { width: 100%; overflow-x: auto; padding-bottom: 2px; }
}
</style>
