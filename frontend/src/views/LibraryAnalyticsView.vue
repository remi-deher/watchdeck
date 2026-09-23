<template>
    <AppPage
      :title="activeTab === 'table' ? 'Inventaire médiathèque' : 'Insights médiathèque'"
      v-model:query="filters.search"
      search-scope="Bibliothèque"
      placeholder="Filtrer par titre, série ou studio…"
      search-kind="filter"
      :match-count="tableTotal"
      :has-filters="activeTab === 'table'"
      :active-count="activeCount"
      :filters-open="filtersOpen"
      @toggle-filters="filtersOpen = !filtersOpen" page-class="analytics-page">

      <template #tools>
        <UiButton variant="primary" :href="exportUrl"><template #icon><FileDown /></template>Exporter CSV</UiButton>
        <UiButton v-if="activeTab === 'table'" icon-only title="Personnaliser les colonnes" aria-label="Personnaliser les colonnes" @click="mediaTable?.openColumnPicker()"><Columns /></UiButton>
      </template>

    <UiFeedback v-if="loading && !data.summary" type="loading" message="Analyse du catalogue Plex…" />
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load()" />

    <div class="psh-layout">
      <FilterSidebar v-if="activeTab === 'table'" :open="filtersOpen" :active-count="activeCount" @close="filtersOpen=false" @reset="reset">
        <select v-model="filters.media_type" aria-label="Filtrer par type"><option value="">Tous les types</option><option value="movie">Films</option><option value="episode">Épisodes</option><option value="track">Musique</option></select>
        <select v-model="filters.library" aria-label="Filtrer par bibliothèque"><option value="">Toutes les bibliothèques</option><option v-for="value in data.options?.library || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.studio" aria-label="Filtrer par studio"><option value="">Tous les studios</option><option v-for="value in data.options?.studio || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.video_codec" aria-label="Filtrer par codec vidéo"><option value="">Tous les codecs vidéo</option><option v-for="value in data.options?.video_codec || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.audio_codec" aria-label="Filtrer par codec audio"><option value="">Tous les codecs audio</option><option v-for="value in data.options?.audio_codec || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.audio_language" aria-label="Filtrer par langue audio"><option value="">Toutes les langues audio</option><option v-for="value in data.options?.audio_language || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.video_resolution" aria-label="Filtrer par résolution"><option value="">Toutes les résolutions</option><option v-for="value in data.options?.video_resolution || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.container" aria-label="Filtrer par conteneur"><option value="">Tous les conteneurs</option><option v-for="value in data.options?.container || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.subtitle" aria-label="Sous-titres"><option value="">Sous-titres : indifférent</option><option value="with">Avec sous-titres</option><option value="without">Sans sous-titres</option></select>
        <select v-model="filters.subtitle_language" aria-label="Langue sous-titres"><option value="">Toutes les langues de sous-titres</option><option v-for="value in data.options?.subtitle_language || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.subtitle_type" aria-label="Format sous-titres"><option value="">Tous les formats de sous-titres</option><option v-for="value in data.options?.subtitle_type || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.viewer" aria-label="Filtrer par spectateur"><option value="">Tous les spectateurs</option><option v-for="value in data.options?.viewer || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.watched" aria-label="Filtrer par visionnage"><option value="">Audience : indifférent</option><option value="yes">Visionnés</option><option value="no">Non visionnés</option></select>
        <input v-model.number="filters.min_size_gb" type="number" min="0" step="0.5" placeholder="Poids min. (Go)" aria-label="Poids minimal en Go">
        <input v-model.number="filters.max_size_gb" type="number" min="0" step="0.5" placeholder="Poids max. (Go)" aria-label="Poids maximal en Go">
      </FilterSidebar>
      <div class="psh-main">

    <section v-if="activeTab === 'table'" class="workspace-section inventory-section">
      <header class="section-heading">
        <div><span class="eyebrow">Inventaire</span><h2>Fichiers analysés</h2></div>
        <small>{{ date(data.generated_at) }}</small>
      </header>
      <MediaRowsTable
        ref="mediaTable"
        :items="visibleItems"
        :sort-key="sort.key"
        :sort-direction="sort.direction"
        @update:sort="setSort"
      />
      <UiButton v-if="tableHasMore" :loading="loadingMore" @click="loadTable(true)">Afficher 100 lignes de plus</UiButton>
      <UiEmptyState v-if="!loading && !tableItems.length" title="Aucun fichier" message="Aucun fichier ne correspond aux filtres." compact />
    </section>

    <section v-else class="workspace-section insights-section">
      <header class="section-heading">
        <div><span class="eyebrow">Exploration</span><h2>Insights interactifs</h2></div>
        <small>Cliquez sur une carte ou une catégorie pour actualiser le tableau.</small>
      </header>

      <MetricGrid v-if="data.summary" class="analytics-metrics">
        <MetricCard label="Fichiers" :value="number(data.summary.items)" detail="filtre actuel" />
        <MetricCard label="Poids total" :value="bytes(data.summary.size_bytes)" detail="stockage observé" />
        <MetricCard label="Durée" :value="duration(data.summary.duration_ms)" detail="contenu cumulé" />
        <MetricCard label="Lectures" :value="number(data.summary.plays)" :detail="`${data.summary.viewers} spectateur(s)`" />
      </MetricGrid>

      <div class="insight-grid">
        <button
          v-for="insight in data.insights || []"
          :key="insight.kind"
          type="button"
          class="panel insight-card"
          :class="{ active: selectedInsight.kind === insight.kind }"
          :aria-pressed="selectedInsight.kind === insight.kind"
          @click="selectInsight(insight)"
        >
          <Lightbulb />
          <div><span>{{ insight.title }}</span><strong>{{ insight.unit === 'bytes' ? bytes(insight.value) : number(insight.value) }}</strong></div>
          <ChevronRight />
        </button>
      </div>

      <div class="analytics-grid">
        <BreakdownPanel
          v-for="chart in charts"
          :key="chart.key"
          :title="chart.title"
          :eyebrow="chart.eyebrow"
          :tone="chart.tone"
          :interactive="!!chart.field"
          :selected="selectedFor(chart)"
          :items="breakdown(chart.key)"
          @select="selectDistribution(chart, $event)"
        />
      </div>

      <section class="panel insight-results" aria-live="polite">
        <div class="panel-head">
          <div><span class="eyebrow">Sélection active</span><h2>{{ selectedInsight.title }}</h2></div>
          <strong>{{ number(insightTotal) }} fichier(s)</strong>
        </div>
        <MediaRowsTable :items="selectedVisibleRows" :sort-key="sort.key" :sort-direction="sort.direction" @update:sort="setSort" />
        <UiButton v-if="insightHasMore" :loading="loadingMore" @click="loadInsight(true)">Afficher 100 lignes de plus</UiButton>
        <UiEmptyState v-if="!selectedRows.length" title="Aucun fichier" message="Aucun fichier pour cet insight." compact />
      </section>
    </section>
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->
  </AppPage>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import { ChevronRight, Columns, FileDown, Lightbulb } from '@lucide/vue';

import { api } from '@/api';
import BreakdownPanel from '@/components/activity/BreakdownPanel.vue';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
const MediaRowsTable = defineAsyncComponent(() => import('@/components/library/MediaRowsTable.vue'));
import { refDebounced } from '@vueuse/core';
import { humanizeError } from '@/utils/apiError';
import { useRealtime } from '@/events';
import {
  DEFAULT_INSIGHT,
  distributionSelection,
  insightSelection,
} from '@/libraryAnalyticsInsights';
import {
  formatDateTime,
  formatDurationRoundHours as duration,
  formatFileSize as bytes,
  formatInteger as number,
} from '@/utils/format';

const route=useRoute();
const activeTab = computed(()=>route.query.view==='insights'?'insights':'table');
const filtersOpen = ref(false);
const selectedInsight = ref<any>({ ...DEFAULT_INSIGHT });
const mediaTable = ref<any>(null);
const filters = reactive<Record<string, any>>({
  search: '', media_type: '', library: '', studio: '', video_codec: '',
  audio_codec: '', audio_language: '', container: '', subtitle: '',
  subtitle_language: '', subtitle_type: '', watched: '', viewer: '', artist: '', video_resolution: '',
  min_size_gb: '', max_size_gb: '',
});
const charts = [
  { key: 'types', title: 'Types de médias', eyebrow: 'Catalogue', tone: 'blue', field: 'media_type' },
  { key: 'studios', title: 'Studios principaux', eyebrow: 'Origine', tone: 'accent', field: 'studio' },
  { key: 'artists', title: 'Artistes principaux', eyebrow: 'Musique', tone: 'purple', field: 'grandparent_title' },
  { key: 'video_codecs', title: 'Codecs vidéo', eyebrow: 'Vidéo', tone: 'green', field: 'video_codec' },
  { key: 'audio_codecs', title: 'Codecs audio', eyebrow: 'Audio', tone: 'purple', field: 'audio_codec' },
  { key: 'resolutions', title: 'Résolutions', eyebrow: 'Qualité', tone: 'blue', field: 'video_resolution' },
  { key: 'containers', title: 'Conteneurs', eyebrow: 'Fichiers', tone: 'red', field: 'container' },
];

const MEDIA_TYPE_DISTRIBUTION_LABELS = { movie: 'Films', episode: 'Épisodes', track: 'Musique' };

const params = computed(() => {
  const value = new URLSearchParams();
  Object.entries(filters).forEach(([key, item]) => { if (item !== '' && item != null) value.set(key, item); });
  return value;
});
const activeCount = computed(() => [...params.value].length);
const exportUrl = computed(() => `/api/library-analytics/export.csv?${params.value}`);
const visibleItems = computed(() => tableItems.value);
const selectedRows = computed(() => insightItems.value);
const selectedVisibleRows = computed(() => insightItems.value);

/* Le tri vit ici et part au serveur (voir setSort). */
const sort = reactive<{ key: string; direction: 'asc' | 'desc' }>({ key: 'title', direction: 'asc' });
/* Les filtres changent a la frappe : la chaine de requete est lissee avant d'entrer
   dans les cles, pour qu'une saisie ne declenche qu'une lecture. */
const filterKey = refDebounced(computed(() => params.value.toString()), 250);
const queryClient = useQueryClient();
const EMPTY_SNAPSHOT = { items: [], options: {}, distributions: {} };
const snapshotQuery = useQuery({
  queryKey: computed(() => ['library-analytics', 'snapshot', filterKey.value]),
  queryFn: ({ signal }) => api<Record<string, any>>(`/api/library-analytics?${filterKey.value}`, { signal }),
  placeholderData: keepPreviousData,
  staleTime: 60_000,
});
const data = computed<Record<string, any>>(() => snapshotQuery.data.value || EMPTY_SNAPSHOT);

interface ItemsPage { items?: any[]; total?: number; has_more?: boolean }
function useItemsPages(scope: 'table' | 'insights', extra: () => Record<string, any>) {
  return useInfiniteQuery({
    queryKey: computed(() => ['library-analytics', 'items', scope, { filters: filterKey.value, sort: sort.key, direction: sort.direction, ...extra() }]),
    queryFn: ({ pageParam, signal }) => {
      const query = new URLSearchParams(filterKey.value);
      Object.entries({ offset: pageParam, limit: 100, sort: sort.key, direction: sort.direction, ...extra() })
        .forEach(([key, item]) => { if (item !== '' && item != null) query.set(key, String(item)); });
      return api<ItemsPage>(`/api/library-analytics/items?${query}`, { signal });
    },
    initialPageParam: 0,
    getNextPageParam: (last: ItemsPage, pages: ItemsPage[]) => (last.has_more ? pages.reduce((sum, page) => sum + (page.items?.length || 0), 0) : undefined),
    enabled: computed(() => activeTab.value === scope),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
const tablePages = useItemsPages('table', () => ({}));
const insightPages = useItemsPages('insights', () => ({
  insight_kind: selectedInsight.value.kind,
  insight_field: selectedInsight.value.field,
  insight_value: selectedInsight.value.value,
}));
const flatten = (pages?: ItemsPage[]) => (pages || []).flatMap(page => page.items || []);
const tableItems = computed(() => flatten(tablePages.data.value?.pages));
const tableTotal = computed(() => tablePages.data.value?.pages[0]?.total || 0);
const tableHasMore = computed(() => Boolean(tablePages.hasNextPage.value));
const insightItems = computed(() => flatten(insightPages.data.value?.pages));
const insightTotal = computed(() => insightPages.data.value?.pages[0]?.total || 0);
const insightHasMore = computed(() => Boolean(insightPages.hasNextPage.value));
const activePages = computed(() => (activeTab.value === 'table' ? tablePages : insightPages));
const loadingMore = computed(() => activePages.value.isFetchingNextPage.value);
const loading = computed(() => snapshotQuery.isFetching.value || (activePages.value.isFetching.value && !loadingMore.value));
const error = computed(() => {
  const failure = snapshotQuery.error.value || activePages.value.error.value;
  return failure ? humanizeError(failure) : '';
});

function breakdown(key: string): any[] {
  const translate = key === 'types' ? ((label: string) => (MEDIA_TYPE_DISTRIBUTION_LABELS as Record<string, string>)[label] || label) : null;
  return (data.value.distributions?.[key] || []).map((item: any) => ({
    label: translate ? translate(item.label) : item.label,
    // Le filtrage (insightRows, cote client) compare a la valeur brute stockee sur
    // chaque item (row.media_type = "track", pas "Musique") : sans rawValue, cliquer un
    // segment traduit ne matcherait plus aucune ligne.
    rawValue: translate ? item.label : undefined,
    value: item.count,
    detail: `${item.percent} % du catalogue filtré`,
  }));
}
function selectInsight(insight: any): void {
  selectedInsight.value = insightSelection(insight);
}
/* Chaque repartition dont le serveur sait filtrer se comporte en filtre de page :
   cliquer « Toei Animation » restreint les autres camemberts, les compteurs et le
   tableau, au lieu de ne changer que la liste du bas. Un second clic relache. */
const DISTRIBUTION_FILTERS: Record<string, string> = {
  media_type: 'media_type',
  studio: 'studio',
  grandparent_title: 'artist',
  video_codec: 'video_codec',
  audio_codec: 'audio_codec',
  video_resolution: 'video_resolution',
  container: 'container',
};

const selectedFor = (chart: any): string => {
  const filterKey = DISTRIBUTION_FILTERS[chart.field];
  if (!filterKey || !filters[filterKey]) return '';
  // Le camembert des types affiche des libelles traduits ; le filtre garde la valeur
  // brute. On rend donc l'etiquette telle qu'elle est dessinee.
  return chart.key === 'types'
    ? (MEDIA_TYPE_DISTRIBUTION_LABELS as Record<string, string>)[filters[filterKey]] || filters[filterKey]
    : filters[filterKey];
};

function selectDistribution(chart: any, value: any): void {
  const filterKey = DISTRIBUTION_FILTERS[chart.field];
  if (filterKey) {
    filters[filterKey] = filters[filterKey] === String(value) ? '' : String(value);
    return;
  }
  selectedInsight.value = distributionSelection(chart, value);
}
/* Le tri vit ici et part au serveur : la table ne recoit que cent lignes sur plusieurs
   milliers, les ordonner sur place repondrait « les plus regardes de la page ». */
function setSort(value: { key: string; direction: 'asc' | 'desc' }): void {
  sort.key = value.key;
  sort.direction = value.direction;
}
/** « Afficher 100 lignes de plus » : les premieres pages suivent la cle d'elles-memes. */
function loadTable(append = false): void { if (append) void tablePages.fetchNextPage(); else void tablePages.refetch(); }
function loadInsight(append = false): void { if (append) void insightPages.fetchNextPage(); else void insightPages.refetch(); }
function load(): Promise<void> { return queryClient.invalidateQueries({ queryKey: ['library-analytics'] }); }
function reset(): void {
  Object.keys(filters).forEach(key => { filters[key] = ''; });
}
function date(value: string): string {
  return value ? `Actualisé ${formatDateTime(value)}` : '';
}

watch(activeTab, () => { filtersOpen.value = false; });
useRealtime(['library.analytics.updated'], () => load());
</script>

<style scoped lang="scss">
.export-link{display:inline-flex;align-items:center;gap: var(--space-2);text-decoration:none}
.workspace-section{display:grid;gap: var(--space-4);padding-top:4px}
.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap: var(--space-5)}
.section-heading h2{margin:3px 0 0}.section-heading small,.panel-head small{color:var(--muted)}
.analytics-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}
.insight-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap: var(--space-3)}
.insight-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap: var(--space-3);width:100%;color:var(--text);text-align:left;cursor:pointer;transition:border-color .2s,transform .2s,background .2s}
.insight-card:hover,.insight-card.active{transform:translateY(-2px);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--surface))}
.insight-card>svg:first-child{width:22px;color:var(--muted)}.insight-card>svg:last-child{width:16px;color:var(--muted)}
.insight-card>div,.media-title{display:grid;min-width:0}.insight-card span{color:var(--muted);font-size:var(--fs-xs)}.insight-card strong{font-size:var(--fs-lg)}
.analytics-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap: var(--space-4)}
.insight-results{display:grid;gap: var(--space-3)}.panel-head>strong{color:var(--text)}
.load-more{justify-self:center}
@media(max-width:900px){.analytics-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.insight-grid{grid-template-columns:1fr}.section-heading{align-items:flex-start}}
@media(max-width:720px){.analytics-grid{grid-template-columns:1fr}.section-heading{display:grid}}
@media(max-width:640px){.export-link{width:100%;justify-content:center}}
@media(max-width:420px){.analytics-metrics{grid-template-columns:1fr}}
</style>
