<template>
    <!-- Inventaire de la médiathèque : deux vues dans l'adresse (fichiers, insights) ; la recherche
         et tous les filtres sont ceux de la barre du haut. L'export est l'action du contexte, le
         choix des colonnes un outil de page. -->
    <PageTemplate
      :title="activeTab === 'table' ? 'Inventaire' : 'Insights de la médiathèque'"
      class="analytics-page"
      :tabs="TABS"
      :active-tab="activeTab"
      tabs-label="Vue de l’inventaire"
      v-model:query="filters.search"
      :search="{ placeholder: 'Filtrer par titre, série ou studio…', scope: 'Bibliothèque', kind: 'filter' }"
      :match-count="tableTotal"
      :filter-count="activeCount"
      :filter-chips="activeChips"
      :state="pageState"
      :error="activeTab === 'insights' ? error : ''"
      skeleton="cards"
      loading-message="Analyse du catalogue Plex…"
      @retry="load()"
      @reset-filters="reset"
    >
      <template #tools>
        <UiButton v-if="activeTab === 'table'" icon-only title="Personnaliser les colonnes" aria-label="Personnaliser les colonnes" @click="mediaTable?.openColumnPicker()"><Columns /></UiButton>
      </template>
      <template #quick-action>
        <UiButton variant="primary" :href="exportUrl"><template #icon><FileDown /></template>Exporter CSV</UiButton>
      </template>

      <template #filters>
        <FilterGroup label="Type de média">
          <UiChipGroup label="Type de média" :options="[{ value: '', label: 'Tous les types' }, { value: 'movie', label: 'Films' }, { value: 'episode', label: 'Épisodes' }, { value: 'track', label: 'Musique' }]" v-model="filters.media_type" />
        </FilterGroup>
        <FilterGroup label="Bibliothèque et studio">
          <UiCombobox label="Bibliothèque" placeholder="Toutes les bibliothèques" :options="(data.options?.library || []).map((value: string) => ({ value, label: value }))" v-model="filters.library" />
          <UiCombobox label="Studio" placeholder="Tous les studios" :options="(data.options?.studio || []).map((value: string) => ({ value, label: value }))" v-model="filters.studio" />
        </FilterGroup>
        <FilterGroup label="Vidéo" :default-open="false">
          <UiCombobox label="Codec vidéo" placeholder="Tous les codecs vidéo" :options="(data.options?.video_codec || []).map((value: string) => ({ value, label: value }))" v-model="filters.video_codec" />
          <UiCombobox label="Résolution" placeholder="Toutes les résolutions" :options="(data.options?.video_resolution || []).map((value: string) => ({ value, label: value }))" v-model="filters.video_resolution" />
          <UiCombobox label="Conteneur" placeholder="Tous les conteneurs" :options="(data.options?.container || []).map((value: string) => ({ value, label: value }))" v-model="filters.container" />
        </FilterGroup>
        <FilterGroup label="Audio" :default-open="false">
          <UiCombobox label="Codec audio" placeholder="Tous les codecs audio" :options="(data.options?.audio_codec || []).map((value: string) => ({ value, label: value }))" v-model="filters.audio_codec" />
          <UiCombobox label="Langue audio" placeholder="Toutes les langues audio" :options="(data.options?.audio_language || []).map((value: string) => ({ value, label: value }))" v-model="filters.audio_language" />
        </FilterGroup>
        <FilterGroup label="Sous-titres" :default-open="false">
          <UiChipGroup label="Sous-titres" :options="[{ value: '', label: 'Indifférent' }, { value: 'with', label: 'Avec' }, { value: 'without', label: 'Sans' }]" v-model="filters.subtitle" />
          <UiCombobox label="Langue des sous-titres" placeholder="Toutes les langues" :options="(data.options?.subtitle_language || []).map((value: string) => ({ value, label: value }))" v-model="filters.subtitle_language" />
          <UiCombobox label="Format des sous-titres" placeholder="Tous les formats" :options="(data.options?.subtitle_type || []).map((value: string) => ({ value, label: value }))" v-model="filters.subtitle_type" />
        </FilterGroup>
        <FilterGroup label="Audience">
          <UiChipGroup label="Visionnage" :options="[{ value: '', label: 'Indifférent' }, { value: 'yes', label: 'Visionnés' }, { value: 'no', label: 'Non visionnés' }]" v-model="filters.watched" />
          <UiCombobox label="Spectateur" placeholder="Tous les spectateurs" :options="(data.options?.viewer || []).map((value: string) => ({ value, label: value }))" v-model="filters.viewer" />
        </FilterGroup>
        <FilterGroup label="Poids">
          <UiNumberField v-model="filters.min_size_gb" :min="0" :step="0.5" placeholder="Min. (Go)" aria-label="Poids minimal en Go" />
          <UiNumberField v-model="filters.max_size_gb" :min="0" :step="0.5" placeholder="Max. (Go)" aria-label="Poids maximal en Go" />
        </FilterGroup>
      </template>

    <!-- Fichiers (gabarit Explorer, en tableau) : le compteur et les filtres actifs sont ceux du
         gabarit ; au-dessus du tableau, le type et les raccourcis qui filtrent ce qu'il liste. -->
    <ExploreTemplate
      v-if="activeTab === 'table'"
      view="table"
      :items="tableItems"
      :total="tableTotal"
      :unit="['fichier', 'fichiers']"
      :chips="activeChips"
      :has-more="tableHasMore"
      :loading="loading"
      :loading-more="loadingMore"
      :error="error"
      empty-title="Aucun fichier"
      empty-message="Aucun fichier ne correspond aux filtres."
      @reset="reset"
      @load-more="loadTable(true)"
      @retry="load()"
    >
      <template #table>
        <section class="panel inventory-table">
          <div class="inventory-toolbar">
            <UiSegmentedControl :model-value="filters.media_type || 'all'" :options="TYPE_OPTIONS" ariaLabel="Type de média" @update:model-value="filters.media_type = $event === 'all' ? '' : String($event)" />
            <UiMenu v-for="menu in quickMenus" :key="menu.key" :label="menu.label" align="start" content-class="quick-filter-menu">
              <template #trigger>
                <button type="button" class="quick-filter" :class="{ active: Boolean(filters[menu.key]) }">
                  {{ filters[menu.key] ? `${menu.label} · ${menu.display(filters[menu.key])}` : menu.label }}<ChevronDown aria-hidden="true" />
                </button>
              </template>
              <UiMenuItem @select="filters[menu.key] = ''"><Check :style="{ visibility: filters[menu.key] ? 'hidden' : 'visible' }" />{{ menu.all }}</UiMenuItem>
              <UiMenuSeparator />
              <UiMenuItem v-for="option in menu.options" :key="option.value" :text-value="option.label" @select="filters[menu.key] = option.value">
                <Check :style="{ visibility: filters[menu.key] === option.value ? 'visible' : 'hidden' }" />{{ option.label }}
              </UiMenuItem>
            </UiMenu>
            <button v-for="lead in leads" :key="lead.key" type="button" class="quick-filter" :class="{ active: lead.active }" :aria-pressed="lead.active" @click="lead.toggle()">
              <component :is="lead.icon" aria-hidden="true" />{{ lead.label }} · {{ lead.value }}
            </button>
          </div>
          <MediaRowsTable
            ref="mediaTable"
            :items="visibleItems"
            :sort-key="sort.key"
            :sort-direction="sort.direction"
            @update:sort="setSort"
          />
        </section>
      </template>
    </ExploreTemplate>

    <!-- Insights (gabarit Analyser, sans periode : c'est l'etat du catalogue) : les chiffres du
         filtre actuel, les insights comme pistes, les repartitions ; une piste ou une categorie
         ouvre la liste des fichiers concernes. -->
    <AnalyzeTemplate
      v-else
      period=""
      :periods="[]"
      :kpis="insightKpis"
      :leads="insightLeads"
      :drill="drill"
      :loading="loading && !data.summary"
      @drill="selectLead"
      @close-drill="closeDrill"
    >
      <template #drill>
        <div class="insight-results" aria-live="polite">
          <strong>{{ number(insightTotal) }} fichier(s)</strong>
          <MediaRowsTable :items="selectedVisibleRows" :sort-key="sort.key" :sort-direction="sort.direction" @update:sort="setSort" />
          <UiButton v-if="insightHasMore" :loading="loadingMore" @click="loadInsight(true)">Afficher 100 lignes de plus</UiButton>
          <UiEmptyState v-if="!selectedRows.length" title="Aucun fichier" message="Aucun fichier pour cet insight." compact />
        </div>
      </template>
      <template #blocks>
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
      </template>
    </AnalyzeTemplate>
    </PageTemplate>
</template>

<script setup lang="ts">
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiCombobox from '@/components/ui/UiCombobox.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import { computed, defineAsyncComponent, reactive, ref } from 'vue';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import { Captions, Check, ChevronDown, Columns, EyeOff, FileDown } from '@lucide/vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import AnalyzeTemplate from '@/components/templates/AnalyzeTemplate.vue';
import ExploreTemplate from '@/components/templates/ExploreTemplate.vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import type { AnalyzeDrill, AnalyzeKpi, AnalyzeLead } from '@/components/templates/AnalyzeTemplate.vue';
import type { FilterChip } from '@/composables/useFiltersDrawer';
import { resolutionLabel } from '@/utils/mediaTechnical';

import { api } from '@/api';
import BreakdownPanel from '@/components/activity/BreakdownPanel.vue';
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
  formatDurationRoundHours as duration,
  formatFileSize as bytes,
  formatInteger as number,
} from '@/utils/format';

const route=useRoute();
const activeTab = computed<'table' | 'insights'>(()=>route.query.view==='insights'?'insights':'table');
/* Les insights ne sont plus une entree de navigation : ils sont la seconde vue de la page, avec leur
   propre adresse (?view=insights) pour qu'un lien y mene toujours. */
const TABS = computed(() => {
  const { view: _view, ...rest } = route.query;
  return [
    { key: 'table', label: 'Fichiers', to: { path: route.path, query: rest } },
    { key: 'insights', label: 'Insights', to: { path: route.path, query: { ...rest, view: 'insights' } } },
  ];
});
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
const TYPE_OPTIONS = [
  { value: 'all', label: 'Tout' },
  { value: 'movie', label: 'Films' },
  { value: 'episode', label: 'Épisodes' },
  { value: 'track', label: 'Musique' },
];

interface QuickMenu { key: string; label: string; all: string; options: Array<{ value: string; label: string }>; display: (value: string) => string }
const optionsOf = (key: string, label: (value: string) => string = (value) => value) =>
  ((data.value.options?.[key] || []) as string[]).map((value) => ({ value, label: label(value) }));
const quickMenus = computed<QuickMenu[]>(() => [
  { key: 'library', label: 'Bibliothèque', all: 'Toutes les bibliothèques', options: optionsOf('library'), display: (value) => value },
  { key: 'video_resolution', label: 'Qualité', all: 'Toutes les résolutions', options: optionsOf('video_resolution', (value) => resolutionLabel(value) || value), display: (value) => resolutionLabel(value) || value },
  { key: 'audio_language', label: 'Audio', all: 'Toutes les langues', options: optionsOf('audio_language'), display: (value) => value },
  { key: 'subtitle', label: 'Sous-titres', all: 'Indifférent', options: [{ value: 'with', label: 'Avec sous-titres' }, { value: 'without', label: 'Sans sous-titres' }], display: (value) => (value === 'with' ? 'avec' : 'sans') },
]);

/* Raccourcis : les deux questions qu'on pose le plus a l'inventaire. Un appui pose le
   filtre correspondant, un second le retire. */
const insightValue = (kind: string): string => {
  const insight = (data.value.insights || []).find((entry: any) => entry.kind === kind);
  return insight && insight.value != null ? number(insight.value) : '—';
};
/* Le serveur renvoie `value: null` quand Plex n'a pas fourni les pistes : on masque alors
   le raccourci « Sans sous-titres » au lieu d'annoncer tout le catalogue. */
const subtitlesKnown = computed(() => (data.value.insights || []).some((entry: any) => entry.kind === 'subtitles' && entry.value != null));
const leads = computed(() => [
  { key: 'unwatched', label: 'Jamais visionnés', icon: EyeOff, tone: 'accent', value: insightValue('unwatched'), active: filters.watched === 'no', toggle: () => { filters.watched = filters.watched === 'no' ? '' : 'no'; } },
  { key: 'subtitles', label: 'Sans sous-titres', icon: Captions, tone: 'blue', value: insightValue('subtitles'), active: filters.subtitle === 'without', toggle: () => { filters.subtitle = filters.subtitle === 'without' ? '' : 'without'; } },
].filter((lead) => lead.key !== 'subtitles' || subtitlesKnown.value));

/* Les filtres actifs, en jetons retirables : sous la barre de la table et en tete du
   panneau de filtres. La recherche reste dans son champ. */
const CHIP_LABELS: Record<string, (value: string) => string> = {
  media_type: (value) => (MEDIA_TYPE_DISTRIBUTION_LABELS as Record<string, string>)[value] || value,
  library: (value) => value,
  studio: (value) => `Studio : ${value}`,
  video_codec: (value) => `Vidéo : ${value}`,
  video_resolution: (value) => `Résolution : ${resolutionLabel(value) || value}`,
  container: (value) => `Conteneur : ${value}`,
  audio_codec: (value) => `Audio : ${value}`,
  audio_language: (value) => `Langue audio : ${value}`,
  subtitle: (value) => (value === 'with' ? 'Avec sous-titres' : 'Sans sous-titres'),
  subtitle_language: (value) => `Sous-titres : ${value}`,
  subtitle_type: (value) => `Format sous-titres : ${value}`,
  watched: (value) => (value === 'yes' ? 'Visionnés' : 'Jamais visionnés'),
  viewer: (value) => `Spectateur : ${value}`,
  artist: (value) => `Artiste : ${value}`,
  min_size_gb: (value) => `Poids ≥ ${value} Go`,
  max_size_gb: (value) => `Poids ≤ ${value} Go`,
};
const activeChips = computed<FilterChip[]>(() => Object.entries(CHIP_LABELS)
  .filter(([key]) => filters[key] !== '' && filters[key] != null)
  .map(([key, label]) => ({ key, label: label(String(filters[key])), onRemove: () => { filters[key] = ''; } })));

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
/* Les chiffres du filtre actuel, les insights comme pistes, et la liste ouverte. */
const insightKpis = computed<AnalyzeKpi[]>(() => (data.value.summary ? [
  { key: 'items', label: 'Fichiers', value: number(data.value.summary.items), detail: 'filtre actuel' },
  { key: 'size', label: 'Poids total', value: bytes(data.value.summary.size_bytes), detail: 'stockage observé' },
  { key: 'duration', label: 'Durée', value: duration(data.value.summary.duration_ms), detail: 'contenu cumulé' },
  { key: 'plays', label: 'Lectures', value: number(data.value.summary.plays), detail: `${data.value.summary.viewers} spectateur(s)` },
] : []));
const insightLeads = computed<AnalyzeLead[]>(() => (data.value.insights || []).map((insight: any) => ({
  key: insight.kind,
  text: `${insight.title} : ${insight.unit === 'bytes' ? bytes(insight.value) : number(insight.value)}`,
})));
const drill = computed<AnalyzeDrill>(() => ({ key: selectedInsight.value.kind, title: selectedInsight.value.title }));
function selectLead(request: { key: string }): void {
  const insight = (data.value.insights || []).find((entry: any) => entry.kind === request.key);
  if (insight) selectInsight(insight);
}
function closeDrill(): void { selectedInsight.value = { ...DEFAULT_INSIGHT }; }
const pageState = computed(() => (loading.value && !data.value.summary ? 'loading' : 'ready'));

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

useRealtime(['library.analytics.updated'], () => load());
</script>

<style scoped lang="scss">
.insight-results{display:grid;gap: var(--space-3)}
.inventory-table{display:grid;gap:0;padding:0;overflow:hidden}
.inventory-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);padding:14px 16px;border-bottom:1px solid var(--border)}
.quick-filter{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border:1px solid var(--border-control,var(--border));border-radius:var(--radius-pill);background:transparent;color:var(--text-secondary,var(--text));font:inherit;font-size:var(--fs-sm);font-weight:500;white-space:nowrap;cursor:pointer}
.quick-filter svg{width:14px}
.quick-filter:hover{border-color:var(--border-hover,var(--border-strong))}
.quick-filter.active{border-color:var(--accent);color:var(--accent)}
.quick-filter:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.inventory-table :deep(.media-rows-table){border:0;border-radius:0;box-shadow:none}
:global(.quick-filter-menu){max-height:min(360px,60dvh);overflow-y:auto}
</style>
