<template>
    <AppPage
      :title="activeTab === 'table' ? 'Inventaire' : 'Insights de la médiathèque'"
      v-model:query="filters.search"
      search-scope="Bibliothèque"
      placeholder="Filtrer par titre, série ou studio…"
      search-kind="filter"
      :match-count="tableTotal"
      :has-filters="true"
      :active-count="activeCount"
      :filters-open="filtersOpen"
      @toggle-filters="filtersOpen = !filtersOpen" page-class="analytics-page">

      <template #tools>
        <UiSegmentedControl :model-value="activeTab" :options="TAB_OPTIONS" ariaLabel="Vue de l’inventaire" @update:model-value="setTab(String($event))" />
        <UiButton variant="primary" :href="exportUrl"><template #icon><FileDown /></template>Exporter CSV</UiButton>
        <UiButton v-if="activeTab === 'table'" icon-only title="Personnaliser les colonnes" aria-label="Personnaliser les colonnes" @click="mediaTable?.openColumnPicker()"><Columns /></UiButton>
      </template>

    <UiFeedback v-if="loading && !data.summary" type="loading" message="Analyse du catalogue Plex…" />
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load()" />

    <!-- En-tete de la page : l'etat de l'analyse. La bascule Fichiers / Insights, qui
         remplace l'entree « Analyses » de la navigation, est dans les actions de la page. -->
    <header class="inventory-head">
      <div class="inventory-head__titles">
        <span class="inventory-head__eyebrow"><span class="status-dot" aria-hidden="true"></span>{{ data.generated_at ? `Catalogue Plex analysé ${formatRelativeDate(data.generated_at)}` : 'Catalogue Plex' }}</span>
        <h2>{{ activeTab === 'table' ? 'Inventaire' : 'Insights' }}</h2>
        <p>{{ activeTab === 'table' ? 'Chaque fichier de la médiathèque, avec sa qualité, ses pistes et son audience.' : 'Cliquez sur une carte ou une catégorie pour filtrer la page.' }}</p>
      </div>
    </header>

    <div class="psh-layout">
      <FilterSidebar :open="filtersOpen" :active-count="activeCount" :chips="activeChips" :match-count="tableTotal" @close="filtersOpen=false" @reset="reset">
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
      </FilterSidebar>
      <div class="psh-main">

    <section v-if="activeTab === 'table'" class="workspace-section inventory-section">
      <!-- Chiffres du filtre courant, puis deux raccourcis : ce sont des filtres de la
           page (visionnage, sous-titres), pas une vue a part. -->
      <div class="inventory-overview">
        <section class="panel inventory-kpis" aria-label="Chiffres du filtre actuel">
          <div><span>Fichiers</span><strong>{{ data.summary ? number(data.summary.items) : '—' }}</strong><small>sur le filtre actuel</small></div>
          <div><span>Poids</span><strong>{{ data.summary ? bytes(data.summary.size_bytes) : '—' }}</strong><small>stockage observé</small></div>
          <div><span>Durée</span><strong>{{ data.summary ? duration(data.summary.duration_ms) : '—' }}</strong><small>contenu cumulé</small></div>
          <div><span>Lectures</span><strong>{{ data.summary ? number(data.summary.plays) : '—' }}</strong><small>{{ data.summary ? `par ${data.summary.viewers} spectateur(s)` : '' }}</small></div>
        </section>
        <div class="inventory-leads">
          <button v-for="lead in leads" :key="lead.key" type="button" class="inventory-lead" :class="[`is-${lead.tone}`, { active: lead.active }]" :aria-pressed="lead.active" @click="lead.toggle()">
            <span class="inventory-lead__icon" aria-hidden="true"><component :is="lead.icon" /></span>
            <span class="inventory-lead__text"><span>{{ lead.label }}</span><strong>{{ lead.value }}</strong></span>
            <X v-if="lead.active" class="inventory-lead__end" aria-hidden="true" />
            <ChevronRight v-else class="inventory-lead__end" aria-hidden="true" />
          </button>
        </div>
      </div>

      <section class="panel inventory-table">
        <!-- Les filtres courants en acces direct ; le reste (studio, codecs, poids...)
             dans le panneau « Plus de filtres ». -->
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
          <button type="button" class="quick-filter" :class="{ active: filtersOpen }" @click="filtersOpen = true"><SlidersHorizontal aria-hidden="true" />Plus de filtres</button>
        </div>
        <div v-if="activeChips.length" class="inventory-active">
          <span class="inventory-active__label">Filtres actifs</span>
          <ul aria-label="Filtres actifs">
            <li v-for="chip in activeChips" :key="chip.key"><button type="button" :aria-label="`Retirer le filtre ${chip.label}`" @click="chip.onRemove()">{{ chip.label }}<X aria-hidden="true" /></button></li>
          </ul>
          <button type="button" class="inventory-active__reset" @click="reset">Tout effacer</button>
          <span class="inventory-active__count"><strong>{{ number(tableTotal) }} fichier(s)</strong><template v-if="data.summary"> · {{ bytes(data.summary.size_bytes) }}</template></span>
        </div>
        <MediaRowsTable
          ref="mediaTable"
          :items="visibleItems"
          :sort-key="sort.key"
          :sort-direction="sort.direction"
          @update:sort="setSort"
        />
        <UiEmptyState v-if="!loading && !tableItems.length" title="Aucun fichier" message="Aucun fichier ne correspond aux filtres." compact />
        <footer v-if="tableItems.length" class="inventory-foot">
          <span>{{ number(tableItems.length) }} sur {{ number(tableTotal) }} fichier(s)<template v-if="data.generated_at"> · {{ date(data.generated_at) }}</template></span>
          <UiButton v-if="tableHasMore" :loading="loadingMore" @click="loadTable(true)">Afficher 100 lignes de plus</UiButton>
        </footer>
      </section>
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
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiCombobox from '@/components/ui/UiCombobox.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { Captions, Check, ChevronDown, ChevronRight, Columns, EyeOff, FileDown, Lightbulb, SlidersHorizontal, X } from '@lucide/vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import type { FilterChip } from '@/composables/useFiltersDrawer';
import { resolutionLabel } from '@/utils/mediaTechnical';

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
  formatRelativeDate,
  formatDurationRoundHours as duration,
  formatFileSize as bytes,
  formatInteger as number,
} from '@/utils/format';

const route=useRoute();
const router = useRouter();
const activeTab = computed<'table' | 'insights'>(()=>route.query.view==='insights'?'insights':'table');
const TAB_OPTIONS = [{ value: 'table' as const, label: 'Fichiers' }, { value: 'insights' as const, label: 'Insights' }];
/* Les insights ne sont plus une entree de navigation : la bascule de la page les ouvre,
   avec leur propre adresse (?view=insights) pour qu'un lien y mene toujours. */
function setTab(tab: string): void {
  const query = { ...route.query };
  if (tab === 'insights') query.view = 'insights'; else delete query.view;
  void router.replace({ query });
}
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
@use '@/styles/foundations/breakpoints' as bp;
.export-link{display:inline-flex;align-items:center;gap: var(--space-2);text-decoration:none}
.workspace-section{display:grid;gap: var(--space-4);padding-top:4px}
.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap: var(--space-5)}
.section-heading h2{margin:3px 0 0}.section-heading small,.panel-head small{color:var(--muted)}
.analytics-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}
.insight-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap: var(--space-3)}
.insight-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap: var(--space-3);width:100%;color:var(--text);text-align:left;cursor:pointer;transition:border-color var(--motion-duration-fast), transform var(--motion-duration-fast), background var(--motion-duration-fast)}
.insight-card:hover,.insight-card.active{transform:translateY(-2px);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--surface))}
.insight-card>svg:first-child{width:22px;color:var(--muted)}.insight-card>svg:last-child{width:16px;color:var(--muted)}
.insight-card>div,.media-title{display:grid;min-width:0}.insight-card span{color:var(--muted);font-size:var(--fs-xs)}.insight-card strong{font-size:var(--fs-lg)}
.analytics-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap: var(--space-4)}
.insight-results{display:grid;gap: var(--space-3)}.panel-head>strong{color:var(--text)}
.load-more{justify-self:center}
.inventory-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--space-4);margin-bottom:var(--space-4)}
.inventory-head__titles{display:grid;gap:6px;min-width:0}
.inventory-head__eyebrow{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:var(--fs-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--green)}
.inventory-head h2{margin:0;font-family:var(--font-display);font-size:var(--fs-3xl);letter-spacing:-.01em;line-height:1.1}
.inventory-head p{margin:0;color:var(--muted)}
.inventory-overview{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:var(--space-4)}
.inventory-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:0}
.inventory-kpis>div{display:grid;gap:4px;align-content:start;padding:16px 18px}
.inventory-kpis>div+div{border-left:1px solid var(--border)}
.inventory-kpis span{color:var(--muted);font-size:var(--fs-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.inventory-kpis strong{font-family:var(--font-display);font-size:var(--fs-2xl);font-variant-numeric:tabular-nums;white-space:nowrap}
.inventory-kpis small{color:var(--muted);font-size:var(--fs-xs)}
.inventory-leads{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:var(--space-3)}
.inventory-lead{--lead:var(--accent);display:flex;align-items:center;gap:var(--space-3);width:100%;padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);color:var(--text);font:inherit;text-align:left;cursor:pointer;transition:border-color var(--motion-duration-fast),background-color var(--motion-duration-fast)}
.inventory-lead.is-blue{--lead:var(--blue)}
.inventory-lead:hover,.inventory-lead.active{border-color:color-mix(in srgb,var(--lead) 55%,transparent);background:color-mix(in srgb,var(--lead) 8%,var(--surface-2))}
.inventory-lead:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.inventory-lead__icon{display:grid;flex:none;place-items:center;width:34px;height:34px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--lead) 16%,transparent);color:var(--lead)}
.inventory-lead__icon svg{width:18px}
.inventory-lead__text{display:grid;flex:1;min-width:0}
.inventory-lead__text span{color:var(--muted);font-size:var(--fs-xs)}
.inventory-lead__text strong{font-family:var(--font-display);font-size:var(--fs-lg)}
.inventory-lead__end{flex:none;width:16px;color:var(--muted)}
.inventory-table{display:grid;gap:0;padding:0;overflow:hidden}
.inventory-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);padding:14px 16px;border-bottom:1px solid var(--border)}
.quick-filter{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border:1px solid var(--border-control,var(--border));border-radius:var(--radius-pill);background:transparent;color:var(--text-secondary,var(--text));font:inherit;font-size:var(--fs-sm);font-weight:500;white-space:nowrap;cursor:pointer}
.quick-filter svg{width:14px}
.quick-filter:hover{border-color:var(--border-hover,var(--border-strong))}
.quick-filter.active{border-color:var(--accent);color:var(--accent)}
.quick-filter:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.inventory-active{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);padding:10px 16px;border-bottom:1px solid var(--border)}
.inventory-active__label{color:var(--muted);font-size:var(--fs-xs)}
.inventory-active ul{display:contents;list-style:none}
.inventory-active li button{display:inline-flex;align-items:center;gap:4px;min-height:30px;padding:0 8px 0 12px;border:0;border-radius:var(--radius-pill);background:var(--surface-3);color:var(--text);font:inherit;font-size:var(--fs-xs);font-weight:600;cursor:pointer}
.inventory-active li button svg{width:14px}
.inventory-active li button:hover{background:color-mix(in srgb,var(--accent) 14%,var(--surface-3));color:var(--accent)}
.inventory-active__reset{padding:0 4px;border:0;background:none;color:var(--accent);font:inherit;font-size:var(--fs-xs);font-weight:600;cursor:pointer}
.inventory-active__count{margin-left:auto;color:var(--muted);font-size:var(--fs-xs)}
.inventory-active__count strong{color:var(--text)}
.inventory-table :deep(.media-rows-table){border:0;border-radius:0;box-shadow:none}
.inventory-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-3);padding:14px 20px;color:var(--muted);font-size:var(--fs-sm)}
:global(.quick-filter-menu){max-height:min(360px,60dvh);overflow-y:auto}
@container page (max-width: 1100px) {.inventory-overview{grid-template-columns:1fr}}
@container page (max-width: 757px) {.inventory-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.inventory-kpis>div:nth-child(3){border-left:0}.inventory-kpis>div:nth-child(n+3){border-top:1px solid var(--border)}.inventory-head{flex-direction:column;align-items:stretch}.inventory-active__count{margin-left:0;width:100%}.analytics-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.insight-grid{grid-template-columns:1fr}.section-heading{align-items:flex-start}}
@include bp.until(tablet) {.analytics-grid{grid-template-columns:1fr}.section-heading{display:grid}}
@include bp.until(phablet) {.export-link{width:100%;justify-content:center}}
@include bp.until(mobile-wide) {.analytics-metrics{grid-template-columns:1fr}}
</style>
