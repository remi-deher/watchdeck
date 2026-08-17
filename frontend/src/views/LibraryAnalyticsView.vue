<template>
  <div class="page analytics-page">
    <PageSearchHeader
      :title="activeTab === 'table' ? 'Inventaire médiathèque' : 'Insights médiathèque'"
      :description="activeTab === 'table' ? 'Explorez les fichiers et caractéristiques techniques présents sur Plex.' : 'Analysez la composition, les usages et les particularités de votre catalogue.'"
      eyebrow="Insights médiathèque"
      v-model:query="filters.search"
      placeholder="Rechercher un titre, une série ou un studio…"
      :has-filters="activeTab === 'table'"
      :active-count="activeCount"
      :filters-open="filtersOpen"
      @toggle-filters="filtersOpen = !filtersOpen"
    >
      <template #actions>
        <TabNav :model-value="activeTab" :tabs="analyticsTabs" aria-label="Vues des insights médiathèque" @update:model-value="selectTab" />
        <UiButton variant="primary" :href="exportUrl"><template #icon><FileDown /></template>Exporter CSV</UiButton>
      </template>
      <template #icon-actions>
        <UiButton v-if="activeTab === 'table'" icon-only title="Personnaliser les colonnes" aria-label="Personnaliser les colonnes" @click="mediaTable?.openColumnPicker()"><Columns /></UiButton>
      </template>
    </PageSearchHeader>

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
        <select v-model="filters.container" aria-label="Filtrer par conteneur"><option value="">Tous les conteneurs</option><option v-for="value in data.options?.container || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.subtitle" aria-label="Sous-titres"><option value="">Sous-titres : indifférent</option><option value="with">Avec sous-titres</option><option value="without">Sans sous-titres</option></select>
        <select v-model="filters.subtitle_language" aria-label="Langue sous-titres"><option value="">Toutes les langues de sous-titres</option><option v-for="value in data.options?.subtitle_language || []" :key="value">{{ value }}</option></select>
        <select v-model="filters.subtitle_type" aria-label="Format sous-titres"><option value="">Tous les formats de sous-titres</option><option v-for="value in data.options?.subtitle_type || []" :key="value">{{ value }}</option></select>
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
      <MediaRowsTable ref="mediaTable" :items="visibleItems" />
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
          :items="breakdown(chart.key)"
          @select="selectDistribution(chart, $event)"
        />
      </div>

      <section class="panel insight-results" aria-live="polite">
        <div class="panel-head">
          <div><span class="eyebrow">Sélection active</span><h2>{{ selectedInsight.title }}</h2></div>
          <strong>{{ number(insightTotal) }} fichier(s)</strong>
        </div>
        <MediaRowsTable :items="selectedVisibleRows" />
        <UiButton v-if="insightHasMore" :loading="loadingMore" @click="loadInsight(true)">Afficher 100 lignes de plus</UiButton>
        <UiEmptyState v-if="!selectedRows.length" title="Aucun fichier" message="Aucun fichier pour cet insight." compact />
      </section>
    </section>
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronRight, Columns, FileDown, Lightbulb } from '@lucide/vue';

import { api } from '@/api';
import BreakdownPanel from '@/components/activity/BreakdownPanel.vue';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';
import TabNav from '@/components/ui/TabNav.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import MediaRowsTable from '@/components/library/MediaRowsTable.vue';
import { useDebounced } from '@/composables/useDebounced';
import { useFetchState } from '@/composables/useFetchState';
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

const route=useRoute(),router=useRouter();
const analyticsTabs=[{value:'table',label:'Inventaire'},{value:'insights',label:'Insights'}];
const activeTab = computed(()=>route.query.view==='insights'?'insights':'table');
const filtersOpen = ref(false);
function selectTab(value: string): void {router.replace({path:'/analytics',query:value==='insights'?{view:'insights'}:{}});filtersOpen.value=false;}
const snapshot = ref<Record<string, any>>({ items: [], options: {}, distributions: {} });
const { loading, error, execute: executeLoad } = useFetchState();
const loadingMore = ref(false);
const tableItems = ref<any[]>([]), tableTotal = ref(0), tableHasMore = ref(false);
const insightItems = ref<any[]>([]), insightTotal = ref(0), insightHasMore = ref(false);
const selectedInsight = ref<any>({ ...DEFAULT_INSIGHT });
const mediaTable = ref<any>(null);
const filters = reactive<Record<string, any>>({
  search: '', media_type: '', library: '', studio: '', video_codec: '',
  audio_codec: '', audio_language: '', container: '', subtitle: '',
  subtitle_language: '', subtitle_type: '', watched: '',
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
const data = computed(() => snapshot.value);
const activeCount = computed(() => [...params.value].length);
const exportUrl = computed(() => `/api/library-analytics/export.csv?${params.value}`);
const visibleItems = computed(() => tableItems.value);
const selectedRows = computed(() => insightItems.value);
const selectedVisibleRows = computed(() => insightItems.value);

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
  loadInsight();
}
function selectDistribution(chart: any, value: any): void {
  selectedInsight.value = distributionSelection(chart, value);
  loadInsight();
}
function queryString(extra: Record<string, any> = {}): string {
  const value = new URLSearchParams(params.value);
  Object.entries(extra).forEach(([key, item]) => { if (item !== '' && item != null) value.set(key, item); });
  return value.toString();
}
async function loadTable(append = false): Promise<void> {
  const offset = append ? tableItems.value.length : 0;
  if (append) loadingMore.value = true;
  try {
    const page = await api(`/api/library-analytics/items?${queryString({ offset, limit: 100 })}`);
    tableItems.value = append ? [...tableItems.value, ...(page.items || [])] : (page.items || []);
    tableTotal.value = page.total || 0;
    tableHasMore.value = Boolean(page.has_more);
  } finally { loadingMore.value = false; }
}
async function loadInsight(append = false): Promise<void> {
  const offset = append ? insightItems.value.length : 0;
  const selection = selectedInsight.value;
  if (append) loadingMore.value = true;
  try {
    const page = await api(`/api/library-analytics/items?${queryString({
      offset, limit: 100, insight_kind: selection.kind,
      insight_field: selection.field, insight_value: selection.value,
    })}`);
    insightItems.value = append ? [...insightItems.value, ...(page.items || [])] : (page.items || []);
    insightTotal.value = page.total || 0;
    insightHasMore.value = Boolean(page.has_more);
  } finally { loadingMore.value = false; }
}
async function load(refresh = false): Promise<void> {
  await executeLoad(async () => {
    snapshot.value = await api(`/api/library-analytics?${queryString(refresh ? { refresh: true } : {})}`);
    if (activeTab.value === 'table') await loadTable();
    else await loadInsight();
  });
}
function reset(): void {
  Object.keys(filters).forEach(key => { filters[key] = ''; });
}
function date(value: string): string {
  return value ? `Actualisé ${formatDateTime(value)}` : '';
}

onMounted(() => load());
const reloadForFilters = useDebounced(() => load(), 250);
watch(filters, reloadForFilters, { deep: true });
watch(activeTab, value => {
  if (value === 'table' && !tableItems.value.length) loadTable();
  if (value === 'insights' && !insightItems.value.length) loadInsight();
});
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
