<template>
    <AppPage
      :title="pageTitle"
      v-model:query="query"
      search-scope="Acquisition"
      :placeholder="searchPlaceholder"
      search-kind="filter"
      :has-filters="hasFilterGroups"
      :active-count="totalActiveFilterCount"
      :filters-open="filtersOpen"
      @toggle-filters="filtersOpen = !filtersOpen" page-class="downloads-page">

      <!-- Un seul slot `tools` : Vue n'en garde qu'un par nom, et deux declarations
           successives faisaient disparaitre la premiere. Les conditions vivent donc
           sur les blocs, a l'interieur. -->
      <template #tools>
        <div v-if="section==='clients'&&subview==='instances'&&!sourceNeedsConfiguration" class="client-header-actions">
          <span class="badge">{{ filteredClients.length }} torrent(s)</span>
          <UiButton variant="primary" size="sm" title="Ajouter un torrent" @click="showAddModal = true"><template #icon><Plus /></template>Ajouter un torrent</UiButton>
          <UiButton size="sm" icon-only title="Personnaliser les colonnes" aria-label="Personnaliser les colonnes" @click="clientTable?.openColumnPicker()"><Columns /></UiButton>
        </div>
      </template>

    <div class="psh-layout">
      <!-- Le contenu du tiroir est entierement conditionnel : sur « Vue d'ensemble »
           avec une seule instance *arr, aucun groupe ne s'affichait et il ne restait
           qu'une boite « Filtres » vide occupant une colonne entiere. On ne monte donc
           la surface de filtrage que lorsqu'il y a quelque chose a filtrer. -->
      <FilterSidebar v-if="hasFilterGroups" :open="filtersOpen" :active-count="totalActiveFilterCount" @close="filtersOpen=false" @reset="resetAllFilters">
        <!-- Type, etat, instance : tous les filtres au meme endroit. Avant, l'etat
             vivait dans une rangee d'onglets sur Films et Series, et dans ce tiroir
             sous « Affichage » sur les autres pages -- deux idiomes pour la meme
             chose, repartis au hasard des sections. -->
        <FilterGroup v-if="section === 'queue' || section === 'missing'" label="Type de média">
          <UiChipGroup label="Type de média" :options="MEDIA_TYPE_OPTIONS" v-model="mediaType" />
        </FilterGroup>

        <FilterGroup v-if="section === 'queue'" label="État">
          <UiChipGroup label="État" :options="QUEUE_STATE_OPTIONS" :model-value="subview" @update:model-value="selectSubview" />
        </FilterGroup>

        <FilterGroup v-if="(section === 'queue' || section === 'missing') && typedArrInstances.length > 1" label="Instance">
          <UiChipGroup label="Instance" :options="[{ value: '', label: 'Toutes' }, ...typedArrInstances.map((source: any) => ({ value: String(source.id), label: source.name }))]" :model-value="selectedInstanceId || ''" @update:model-value="selectInstanceId" />
        </FilterGroup>

        <template v-if="section==='clients'">
          <FilterGroup label="Vue">
            <UiChipGroup label="Vue" :options="[{ value: 'instances', label: 'Torrents' }, { value: 'overview', label: 'Synthèse' }]" v-model="subview" />
          </FilterGroup>

          <template v-if="subview==='instances'">
            <!-- Trois etats par pastille : un appui inclut, le suivant exclut, le troisieme libere. -->
            <FilterGroup v-if="torrentFacetOptions.status.length" label="Statut">
              <UiChipGroup label="Statut" exclusion :options="torrentFacetOptions.status" :model-value="asArray(status)" @update:model-value="status = $event" />
            </FilterGroup>
            <FilterGroup v-if="torrentFacetOptions.category.length" label="Catégorie">
              <UiChipGroup label="Catégorie" exclusion :options="torrentFacetOptions.category" :model-value="asArray(clientCategory)" @update:model-value="clientCategory = $event" />
            </FilterGroup>
            <FilterGroup v-if="torrentFacetOptions.client.length > 1" label="Client">
              <UiChipGroup label="Client" :options="[{ value: '', label: 'Tous' }, ...torrentFacetOptions.client]" :model-value="selectedClientName" @update:model-value="setClientFilter" />
            </FilterGroup>
            <FilterGroup v-if="torrentFacetOptions.tracker.length" label="Tracker" :default-open="false" :value="asArray(clientTracker).join(', ')">
              <UiChipGroup label="Tracker" exclusion :options="torrentFacetOptions.tracker" :model-value="asArray(clientTracker)" @update:model-value="clientTracker = $event" />
            </FilterGroup>
            <FilterGroup label="Origine">
              <UiChipGroup label="Origine" :options="[{ value: '', label: 'Toutes' }, { value: 'watchdeck', label: 'Watchdeck' }, { value: 'external', label: 'Externes' }]" v-model="clientOwnership" />
            </FilterGroup>
          </template>
        </template>

        <template v-else>
          <FilterGroup v-if="instances.length > 1" label="Instance">
            <UiChipGroup label="Instance" :options="[{ value: '', label: 'Toutes' }, ...instances.map((val: string) => ({ value: val, label: val }))]" v-model="instance" />
          </FilterGroup>
        </template>
      </FilterSidebar>

      <div class="psh-main">
        <DownloadsOverview
          v-if="section==='overview'"
          :queue="queue"
          :history="history"
          :client-queue="clientQueue"
          :client-errors="clientErrors"
          :disk-space-volumes="diskSpaceVolumes"
          :arr-instances="configuredArr"
          :configured-clients="configuredClients"
          :arr-queue="arrQueue"
          :wanted-items="wantedItems"
          :prowlarr-stats="prowlarrStats"
          :client-stats="clientOverviewStats"
          @resolve="openManual"
        />

        <!-- Banner synthétique pour vue spécifique Radarr / Sonarr -->
        <ArrDownloadsLayout
          v-if="section === 'queue'"
          :instances="filteredSectionArrInstances"
          :arr-queue="arrQueue"
          :wanted-items="wantedItems"
          :unmatched-items="unmatchedItems"
          :row-key="rowKey"
          @view-unmatched="openUnmatched"
          @associate="openManual"
        />
        <TorrentOverviewDashboard
          v-if="section==='clients' && subview==='overview' && !sourceNeedsConfiguration"
          :clients="configuredClients"
          :torrents="clientQueue"
          :client-id="selectedClientId"
          @select="selectClientDashboard"
        />

        <UnmatchedImportsBanner v-if="section === 'overview' || section === 'queue'" :items="unmatchedItems" :row-key="rowKey" @view-all="openUnmatched" @associate="openManual"/>

        <UiFeedback v-if="error" type="error" title="Chargement partiel" :message="error" retry @retry="loadAll"/>
        <UiFeedback v-if="loading&&!queue.length" type="loading" message="Chargement des téléchargements…"/>
        <section v-if="sourceNeedsConfiguration" class="panel download-source-empty">
          <component :is="Server" />
          <div><h2>Aucun client torrent configuré</h2><p>Cette source reste facultative et n’empêche pas le suivi des autres téléchargements.</p></div>
          <UiButton variant="primary" to="/settings/services/integrations"><template #icon><Plus/></template>Ajouter un client</UiButton>
        </section>

        <DownloadQueueGroups
          v-if="section!=='clients'&&section!=='missing'&&!showHistory&&!sourceNeedsConfiguration"
          :groups="queueGroups"
          :history="filteredHistory"
          :show-recent="subview==='all'"
          :empty-message="!filteredQueue.length && subview!=='all' ? 'Aucun téléchargement actif.' : ''"
          :loading="loading"
          :acting-keys="actingKeys"
          @manual="openManual"
          @action="queueAction"
        />

        <MissingItemsSection
          v-else-if="section==='missing'"
          :items="wantedItems"
          :media-type="mediaType"
          :loading="loadingWanted"
          @error="setSourceError('wanted', $event)"
        />

        <section v-else-if="section==='clients'&&subview==='instances'&&!sourceNeedsConfiguration" class="client-table-main" role="tabpanel">
          <UiFeedback v-for="row in clientErrors" :key="row.client_id" type="error" :title="row.client_name" :message="row.client_error"/>
          <TorrentClientsTable ref="clientTable" :rows="filteredClients" :client-id="selectedClientId" :preference-scope="selectedClientId || 'all'" @refresh="loadClients" @error="setSourceError('clients', $event)" @add-file="handleDroppedFile" />
          <p v-if="!loading&&!filteredClients.length&&!clientErrors.length" class="empty">Aucun torrent ne correspond aux filtres actifs.</p>
        </section>

        <div v-else-if="section==='clients'&&subview==='overview'" aria-hidden="true" />

        <DownloadHistoryTable v-else-if="showHistory" :rows="filteredHistory" :errors="historyErrors" :has-more="hasMoreHistory" :loading="loadingHistory" :sort="historySort" @update:sort="setHistorySort" @load-more="loadMoreHistory" />
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->

    <AddTorrentModal :open="showAddModal" :clients="configuredClients" :initial-file="droppedFile" @close="showAddModal = false; droppedFile = null" @added="loadClients" />
    <ManualImportModal v-if="manualRow" :row="manualRow" @close="manualRow=null" @submitted="onManualSubmitted"/>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)"/>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { AlertTriangle, Clock3, Columns, Download, Plus, Server } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { useConfirm } from '@/composables/useConfirm';
import { useDownloadHistory } from '@/composables/useDownloadHistory';
import { useDownloadSources } from '@/composables/useDownloadSources';
import { readPreference, writePreference } from '@/composables/usePreference';
import { filterClients, torrentFacets } from '@/downloads/clientFilters';
import { isUnmatched, needsEpisodeImport, requiresIntervention, rowKey, statusKey } from '@/downloads/queueRules';
import ConfirmModal from '@/components/ConfirmModal.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import AddTorrentModal from '@/components/downloads/AddTorrentModal.vue';
import ArrDownloadsLayout from '@/components/downloads/ArrDownloadsLayout.vue';
import DownloadHistoryTable from '@/components/downloads/DownloadHistoryTable.vue';
import DownloadQueueGroups, { type QueueGroup } from '@/components/downloads/DownloadQueueGroups.vue';
import DownloadsOverview from '@/components/downloads/DownloadsOverview.vue';
import ManualImportModal from '@/components/downloads/ManualImportModal.vue';
import MissingItemsSection from '@/components/downloads/MissingItemsSection.vue';
import TorrentOverviewDashboard from '@/components/downloads/TorrentOverviewDashboard.vue';
import UnmatchedImportsBanner from '@/components/downloads/UnmatchedImportsBanner.vue';

// La table des torrents (TanStack, inspecteur, menus) n'est utile que sur l'onglet
// Clients, la charger a la demande garde l'apercu et la file d'attente legers.
const TorrentClientsTable = defineAsyncComponent(() => import('@/components/downloads/TorrentClientsTable.vue'));

const route = useRoute();
const router = useRouter();

/**
 * Une reponse mal formee ne doit pas se propager en liste.
 *
 * Ces refs sont consommees directement par des `computed` (`[...arrQueue.value]`,
 * `clientQueue.value.filter(...)`). Une valeur non iterable y leve une TypeError, ce
 * qui interrompt le cycle de rendu de Vue : ce n'est alors pas la page qui se degrade,
 * c'est le shell entier qui reste a moitie rendu, sans rien a l'ecran pour l'expliquer.
 */
function asList<T>(value: unknown): T[] { return Array.isArray(value) ? (value as T[]) : []; }

/* ---- Section, sous-vue et filtres portes par l'adresse ---- */

/* Quatre sections, plus aucune rangee d'onglets.
 *
 * « Films » et « Series » etaient deux fois la meme page au type de media pres, et
 * « File d'attente » etait deja cette page sans le filtre : trois sections pour une
 * seule liste. Le type de media est devenu un filtre, aux cotes de l'etat, de
 * l'instance et du client -- tous au meme endroit, dans le tiroir, au lieu d'etre
 * repartis entre une rangee d'onglets et un tiroir a moitie vide selon la page.
 */
const section = computed((): string => ['queue', 'missing', 'clients'].includes(String(route.query.view)) ? String(route.query.view) : 'overview');
const VALID_SUBVIEWS: Record<string, string[]> = {
  overview: ['all'],
  queue: ['all', 'active', 'waiting', 'completed', 'errors', 'intervention'],
  missing: ['all'],
  clients: ['overview', 'instances'],
};
const subview = computed((): string => {
  if (VALID_SUBVIEWS[section.value].includes(String(route.query.sub))) return String(route.query.sub);
  return section.value === 'clients' ? 'overview' : 'all';
});
/** Filtre de type de media : remplace les anciennes sections Films et Series. */
const mediaType = computed({
  get: (): string => ['radarr', 'sonarr'].includes(String(route.query.type)) ? String(route.query.type) : '',
  set: (value: string) => { router.replace({ query: { ...route.query, type: value || undefined } }); },
});
const selectedClientId = computed(() => route.query.client ? String(route.query.client) : '');
const selectedInstanceId = computed(() => route.query.instance ? String(route.query.instance) : '');
// « Terminés » dans la file : ce qui est fini vit dans l'historique, pas dans la file.
const showHistory = computed(() => section.value === 'queue' && subview.value === 'completed');

const MEDIA_TYPE_OPTIONS = [
  { value: '', label: 'Tous les médias' },
  { value: 'radarr', label: 'Films' },
  { value: 'sonarr', label: 'Séries' },
];
const QUEUE_STATE_OPTIONS = [
  { value: 'all', label: 'Tout' },
  { value: 'active', label: 'En cours' },
  { value: 'waiting', label: 'En attente' },
  { value: 'intervention', label: 'Interventions' },
  { value: 'completed', label: 'Terminés' },
  { value: 'errors', label: 'Erreurs' },
];

function selectSubview(value: string) {
  statusFilter.value = '';
  router.replace({ path: '/downloads', query: { ...route.query, view: section.value, sub: value } });
}
/** Restreint la file a une instance ; chaine vide pour les reprendre toutes. */
function selectInstanceId(value: string) {
  const next: Record<string, any> = { ...route.query, view: section.value };
  if (value) next.instance = value; else delete next.instance;
  router.replace({ path: '/downloads', query: next });
}
function selectClientDashboard(client: any) {
  router.replace({ path: '/downloads', query: { view: 'clients', sub: 'instances', client: client.id } });
}
function openUnmatched() {
  router.replace({ path: '/downloads', query: { view: 'queue', sub: 'intervention' } });
  statusFilter.value = 'unmatched';
}
function setClientFilter(name: string) {
  const found = configuredClients.value.find((c: any) => c.name === name);
  const q: Record<string, any> = { ...route.query };
  if (found) q.client = String(found.id); else delete q.client;
  router.replace({ path: '/downloads', query: q });
}

/* ---- Filtres locaux ---- */

const query = ref('');
const instance = ref('');
const status = ref<string | string[]>('');
const statusFilter = ref('');
const clientCategory = ref<string | string[]>('');
const clientOwnership = ref('');
const clientTracker = ref<string | string[]>('');

// Le panneau de filtres s'ouvre a la demande, comme partout : il sort de la barre et
// recouvre le haut de la page, il ne peut donc plus etre ouvert d'office.
const filtersOpen = ref(false);

function resetFilters() {
  query.value = ''; instance.value = ''; status.value = ''; statusFilter.value = '';
  clientCategory.value = ''; clientOwnership.value = ''; clientTracker.value = '';
}
function resetClientFilters() {
  query.value = ''; status.value = []; clientCategory.value = []; clientOwnership.value = ''; clientTracker.value = [];
}
function resetAllFilters() { resetFilters(); resetClientFilters(); }

/* Les filtres des torrents sont retenus par client. */
const clientFilterStorageKey = () => `torrent-filters:${selectedClientId.value || 'all'}`;
function loadClientFilterPreferences() {
  try {
    const saved = readPreference<any>(clientFilterStorageKey(), null);
    if (!saved) { resetClientFilters(); return; }
    query.value = saved.query || '';
    status.value = saved.status || [];
    clientCategory.value = saved.category || [];
    clientOwnership.value = saved.ownership || '';
    clientTracker.value = saved.tracker || [];
  } catch { resetClientFilters(); }
}
watch([query, status, clientCategory, clientOwnership, clientTracker], () => {
  if (section.value !== 'clients') return;
  writePreference(clientFilterStorageKey(), { query: query.value, status: status.value, category: clientCategory.value, ownership: clientOwnership.value, tracker: clientTracker.value });
}, { deep: true });

/* ---- Erreurs par source ---- */

const sourceErrors = ref<Record<string, string>>({ queue: '', clients: '', wanted: '', history: '', configuration: '', disk: '', action: '', ui: '' });
function setSourceError(source: string, value = '') { sourceErrors.value = { ...sourceErrors.value, [source]: value || '' }; }
// Le bandeau ne cite que les sources lues par la section affichee.
const error = computed({
  get: (): string => {
    const relevant = ['configuration', 'action', 'ui'];
    if (section.value !== 'clients') relevant.push('queue');
    if (readsClients()) relevant.push('clients');
    if (readsWanted()) relevant.push('wanted');
    if (readsHistory()) relevant.push('history');
    if (section.value === 'overview') relevant.push('disk');
    return relevant.map(key => sourceErrors.value[key]).filter(Boolean).join(' · ');
  },
  set: (value: string) => setSourceError('ui', value),
});

/* ---- Sources ---- */

const readsClients = () => ['overview', 'clients'].includes(section.value);
const readsWanted = () => ['overview', 'queue', 'missing'].includes(section.value);
const readsHistory = () => section.value === 'overview' || showHistory.value || section.value === 'queue';

const { arrInstances: configuredArr, downloadClients: configuredClients, loading: configurationsLoading, error: configurationError, load: loadDownloadSources } = useDownloadSources();
async function loadConfigurations(): Promise<void> {
  await loadDownloadSources();
  setSourceError('configuration', configurationError.value);
}

const clientsQuery = useQuery({
  queryKey: ['downloads', 'clients'],
  queryFn: ({ signal }) => api('/api/downloads/clients', { signal }),
  select: (rows) => asList<any>(rows),
  enabled: () => readsClients(),
  staleTime: 5_000,
});
const clientQueue = computed<any[]>(() => clientsQuery.data.value || []);
watch(clientsQuery.error, (value) => setSourceError('clients', value ? `Clients torrent : ${value.message}` : ''), { immediate: true });

// Les deux sources de la file : chacune sa cle, pour qu'un echec de l'une n'efface pas
// l'autre. Elles ne sont lues que hors de la section Clients.
const queueEnabled = computed(() => section.value !== 'clients');
const arrQueueQuery = useQuery({
  queryKey: ['downloads', 'arr-queue'],
  queryFn: ({ signal }) => api('/api/arr/queue', { signal }),
  select: (rows) => asList<any>(rows),
  enabled: queueEnabled,
  staleTime: 5_000,
});
const directQueueQuery = useQuery({
  queryKey: ['downloads', 'direct'],
  queryFn: ({ signal }) => api('/api/downloads/direct', { signal }),
  select: (rows) => asList<any>(rows),
  enabled: queueEnabled,
  staleTime: 5_000,
});
const arrQueue = computed<any[]>(() => arrQueueQuery.data.value || []);
const directQueue = computed<any[]>(() => directQueueQuery.data.value || []);
// Le bandeau nomme la source en defaut, comme le faisait le Promise.allSettled.
watch([arrQueueQuery.error, directQueueQuery.error], ([arrError, directError]) => {
  const failures = [
    arrError ? `File Sonarr/Radarr : ${arrError.message}` : '',
    directError ? `Téléchargements directs : ${directError.message}` : '',
  ].filter(Boolean);
  setSourceError('queue', failures.join(' · '));
}, { immediate: true });

const diskSpaceVolumes = ref<any[]>([]);
async function loadDiskSpace(): Promise<void> {
  try {
    diskSpaceVolumes.value = asList(await api('/api/disk-space'));
    setSourceError('disk');
  } catch (e: any) {
    setSourceError('disk', `Stockage : ${e.message}`);
  }
}

const prowlarrStats = ref<Record<string, any>>({});
const clientOverviewStats = ref<Record<string, any>>({});
async function loadOverviewInstanceStats(): Promise<void> {
  const prowlarrInstances = configuredArr.value.filter((inst: any) => inst.arr_type === 'prowlarr' && inst.enabled);
  const [prowlarrResults, clientResult] = await Promise.all([
    Promise.allSettled(prowlarrInstances.map((inst: any) => api(`/api/prowlarr/${inst.id}/overview`))),
    api('/api/downloads/global-stats').catch(() => ({ clients: [] })),
  ]);
  prowlarrStats.value = Object.fromEntries(prowlarrInstances.map((inst: any, index: number) => [inst.id,
    (prowlarrResults[index] as any)?.status === 'fulfilled' ? (prowlarrResults[index] as any).value : { connected: false },
  ]));
  clientOverviewStats.value = Object.fromEntries((clientResult.clients || []).map((stats: any) => [stats.client_id, stats]));
}

const wantedItems = ref<any[]>([]);
const loadingWanted = ref(false);
let wantedLoadVersion = 0;
async function loadWanted(): Promise<void> {
  if (!readsWanted()) return;
  const loadVersion = ++wantedLoadVersion;
  if (!wantedItems.value.length) loadingWanted.value = true;
  try {
    // `arr_type` vide = les deux sources : la section couvre films et series, le filtre
    // de type se charge de restreindre.
    const params = new URLSearchParams();
    if (mediaType.value) params.set('arr_type', mediaType.value);
    if (selectedInstanceId.value) params.set('instance_id', selectedInstanceId.value);
    const rows = await api(`/api/arr/wanted?${params}`);
    if (loadVersion === wantedLoadVersion) { wantedItems.value = asList(rows); setSourceError('wanted'); }
  } catch (e: any) {
    if (loadVersion === wantedLoadVersion) setSourceError('wanted', `Éléments manquants : ${e.message}`);
  } finally {
    if (loadVersion === wantedLoadVersion) loadingWanted.value = false;
  }
}

/* Tri de l'historique, fait par le serveur : un nouveau tri relit la premiere page. */
const historySort = ref<{ key: string; direction: 'asc' | 'desc' }>({ key: 'completed', direction: 'desc' });
function setHistorySort(value: { key: string; direction: 'asc' | 'desc' }): void {
  historySort.value = value;
  void loadHistory();
}
const {
  history, errors: historyErrors, loading: loadingHistory, hasMore: hasMoreHistory,
  load: loadHistory, loadMore: loadMoreHistory, reset: resetHistory,
} = useDownloadHistory(
  () => ({ source: mediaType.value, instanceId: selectedInstanceId.value, sort: historySort.value.key, direction: historySort.value.direction }),
  (message) => setSourceError('history', message),
);

/* ---- File d'attente ---- */

const hiddenItems = ref<Set<string>>(new Set());
const queue = computed(() => [...arrQueue.value, ...directQueue.value]
  .filter((row: any) => !hiddenItems.value.has(rowKey(row)))
  .sort((a: any, b: any) => (a.progress || 0) - (b.progress || 0)));
// Le voile de chargement n'apparait que sans rien a afficher : un rafraichissement ne
// doit pas faire clignoter une file deja remplie.
const loading = computed(() => (arrQueueQuery.isFetching.value || directQueueQuery.isFetching.value) && !queue.value.length);

/** Instances concernees par le filtre de type courant ; toutes s'il est vide.
 *  Prowlarr est exclu : c'est un indexeur, il n'alimente aucune file de telechargement. */
const typedArrInstances = computed(() => configuredArr.value.filter(
  (inst: any) => ['radarr', 'sonarr'].includes(inst.arr_type) && (!mediaType.value || inst.arr_type === mediaType.value)
));
const filteredSectionArrInstances = computed(() => typedArrInstances.value.filter(
  (inst: any) => !selectedInstanceId.value || String(inst.id) === selectedInstanceId.value
));
const instances = computed(() => {
  if (mediaType.value) return configuredArr.value.filter((row: any) => row.enabled && row.arr_type === mediaType.value).map((row: any) => row.name);
  if (section.value === 'clients') return configuredClients.value.filter((row: any) => row.enabled).map((row: any) => row.name);
  return [...new Set(queue.value.map((x: any) => x.instance || x.download_client).filter(Boolean))];
});

const matchesScope = (row: any) => (!mediaType.value || row.arr_type === mediaType.value)
  && (!selectedInstanceId.value || String(row.instance_id) === selectedInstanceId.value);
const unmatchedItems = computed(() => queue.value.filter((row: any) => matchesScope(row) && (isUnmatched(row) || needsEpisodeImport(row))));

/** La sous-vue d'etat choisie dans le tiroir. */
function matchesSubview(row: any): boolean {
  const key = statusKey(row);
  if (subview.value === 'active') return key === 'downloading';
  if (subview.value === 'waiting') return ['queued', 'paused', 'completed'].includes(key);
  if (subview.value === 'errors') return key === 'error';
  if (subview.value === 'intervention') return requiresIntervention(row);
  return true;
}
const filteredQueue = computed(() => {
  const activeStatus = status.value || statusFilter.value;
  const needle = query.value.trim().toLocaleLowerCase('fr');
  return queue.value.filter((row: any) => {
    if (!matchesScope(row) || !matchesSubview(row)) return false;
    if (needle && !row.title?.toLocaleLowerCase('fr').includes(needle)) return false;
    if (instance.value && (row.instance || row.download_client) !== instance.value) return false;
    if (activeStatus === 'unmatched') return isUnmatched(row) || needsEpisodeImport(row);
    return !activeStatus || statusKey(row) === activeStatus;
  });
});
const queueGroups = computed((): QueueGroup[] => {
  const intervention = filteredQueue.value.filter(requiresIntervention);
  const ids = new Set(intervention.map(rowKey));
  const remaining = filteredQueue.value.filter((row: any) => !ids.has(rowKey(row)));
  return [
    { key: 'intervention', title: 'Intervention requise', description: 'Import bloqué, erreur ou média à associer', icon: AlertTriangle, items: intervention },
    { key: 'active', title: 'En téléchargement', description: 'Transferts actuellement en progression', icon: Download, items: remaining.filter((row: any) => statusKey(row) === 'downloading') },
    { key: 'waiting', title: 'En attente', description: 'Éléments en file ou temporairement en pause', icon: Clock3, items: remaining.filter((row: any) => ['queued', 'paused', 'completed'].includes(statusKey(row))) },
  ].filter(group => group.items.length);
});

const selectedInstanceName = computed(() => configuredArr.value.find((row: any) => String(row.id) === selectedInstanceId.value)?.name || '');
const filteredHistory = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('fr');
  return history.value.filter((row: any) => (!mediaType.value || row.source === mediaType.value)
    && (!selectedInstanceName.value || row.instance_name === selectedInstanceName.value)
    && (!needle || row.title?.toLocaleLowerCase('fr').includes(needle)));
});

/* ---- Clients torrent ---- */

const clientTable = ref<any>(null);
const showAddModal = ref(false);
const droppedFile = ref<File | null>(null);
function handleDroppedFile(file: File): void {
  droppedFile.value = file;
  showAddModal.value = true;
}

// Les compteurs portent sur tous les torrents, avant filtrage.
const torrentFacetOptions = computed(() => torrentFacets(clientQueue.value));
const asArray = (value: string | string[]): string[] => Array.isArray(value) ? value : value ? [value] : [];
const clientErrors = computed(() => clientQueue.value.filter((row: any) => row.client_error && (!selectedClientId.value || String(row.client_id) === selectedClientId.value)));
const filteredClients = computed(() => filterClients(clientQueue.value, {
  query: query.value,
  clientId: selectedClientId.value,
  category: clientCategory.value,
  status: status.value,
  tracker: clientTracker.value,
  ownership: clientOwnership.value,
}));
const selectedClientName = computed(() => configuredClients.value.find((row: any) => String(row.id) === selectedClientId.value)?.name
  || clientQueue.value.find((row: any) => String(row.client_id) === selectedClientId.value)?.client_name
  || '');
// Seuls les clients torrent peuvent encore manquer : la file couvre desormais toutes
// les sources a la fois, et n'a plus de raison de se declarer « non configuree ».
const sourceNeedsConfiguration = computed(() => !configurationsLoading.value && section.value === 'clients'
  && configuredClients.value.filter((row: any) => row.enabled).length === 0);

/* ---- En-tete de page ---- */

const SECTION_TITLES: Record<string, string> = { overview: 'Vue d’ensemble', queue: 'File d’attente', missing: 'Éléments manquants', clients: 'Clients' };
const pageTitle = computed(() => section.value === 'clients' ? selectedClientName.value || 'Clients' : SECTION_TITLES[section.value] || 'Acquisition');
const searchPlaceholder = computed(() => {
  if (section.value === 'clients') return 'Filtrer les torrents (ex: cat:radarr is:downloading)…';
  if (section.value === 'missing') return 'Filtrer les éléments manquants…';
  return 'Filtrer les téléchargements…';
});
/* Reprend a l'identique les conditions des `FilterGroup` du gabarit : si aucune ne
   passe, il n'y a pas de filtres a proposer et la surface entiere -- colonne, bouton de
   la barre du haut, feuille modale -- n'a pas lieu d'exister. */
const hasFilterGroups = computed(() => ['queue', 'missing', 'clients'].includes(section.value) || instances.value.length > 1);
const isSet = (v: unknown) => Array.isArray(v) ? v.length > 0 : Boolean(v);
const totalActiveFilterCount = computed(() => section.value === 'clients'
  ? [query.value, status.value, clientCategory.value, clientOwnership.value, clientTracker.value].filter(isSet).length
  : [query.value, instance.value, status.value || statusFilter.value].filter(Boolean).length);

/* ---- Actions ---- */

const actingKeys = ref<Set<string>>(new Set());
const manualRow = ref<any>(null);
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

async function queueAction(row: any, blocklist: boolean, search: boolean): Promise<void> {
  const confirmed = await askConfirm({
    title: blocklist ? 'Blocklister ce téléchargement ?' : 'Retirer ce téléchargement ?',
    message: blocklist ? 'Le fichier sera blocklisté et une nouvelle recherche sera lancée.' : 'Le téléchargement sera retiré de la file.',
    confirmLabel: blocklist ? 'Blocklister et rechercher' : 'Retirer',
    danger: true,
  });
  if (!confirmed) return;
  const key = rowKey(row);
  actingKeys.value = new Set([...actingKeys.value, key]);
  try {
    await api(`/api/arr/queue/${row.instance_id}/${row.queue_id}?blocklist=${blocklist}&search=${search}`, { method: 'DELETE' });
    setSourceError('action');
    await loadAll();
  } catch (e: any) {
    setSourceError('action', e.message);
  } finally {
    const next = new Set(actingKeys.value);
    next.delete(key);
    actingKeys.value = next;
  }
}
function openManual(row: any): void { manualRow.value = row; }
async function onManualSubmitted(): Promise<void> {
  hiddenItems.value.add(rowKey(manualRow.value));
  manualRow.value = null;
  await loadAll();
}

/* ---- Rafraichissement ---- */

/* Relit les deux sources de la file. Une lecture deja en vol n'est pas doublee : au
   montage, les queries partent d'elles-memes et `refreshCurrentView` passe ici juste
   apres. Ailleurs (action utilisateur, evenement SSE), on relance vraiment. */
async function loadAll(): Promise<void> {
  await Promise.all([arrQueueQuery.refetch({ cancelRefetch: true }), directQueueQuery.refetch({ cancelRefetch: true })]);
}
async function loadClients(): Promise<void> {
  // TanStack Query annule la requete precedente lors des rafales SSE, conserve la
  // derniere valeur pendant le rafraichissement et relance au retour en ligne/focus.
  const result = await clientsQuery.refetch({ cancelRefetch: true });
  if (result.error) setSourceError('clients', `Clients torrent : ${result.error.message}`);
}

/* `skipQueue` au premier appel : les deux queries de la file se chargent d'elles-memes
   au montage, les relancer ici doublerait l'aller-retour. */
function refreshCurrentView({ skipQueue = false }: { skipQueue?: boolean } = {}) {
  const jobs: Promise<any>[] = [];
  if (section.value !== 'clients' && !skipQueue) jobs.push(loadAll());
  if (readsClients()) jobs.push(loadClients());
  if (readsWanted()) jobs.push(loadWanted());
  if (readsHistory()) jobs.push(loadHistory());
  if (section.value === 'overview') jobs.push(loadDiskSpace(), loadOverviewInstanceStats());
  return Promise.allSettled(jobs);
}

function refreshFromDownloadEvent(detail: any = {}) {
  const job = detail?.job || '';
  const result = detail?.result || {};
  const torrentOnly = Boolean(detail?.client_id) || job === 'torrent-statuses';
  const arrOnly = ['sonarr-queue-monitor', 'radarr-queue-monitor'].includes(job);
  const jobs: Promise<any>[] = [];
  // Les actions utilisateur sans job sont ponctuelles : on actualise uniquement
  // les données opérationnelles, jamais l'historique immuable de la vue d'ensemble.
  if (!torrentOnly && !arrOnly) {
    if (section.value !== 'clients') jobs.push(loadAll());
    if (readsClients()) jobs.push(loadClients());
    return Promise.allSettled(jobs);
  }
  if (torrentOnly && readsClients()) jobs.push(loadClients());
  if (arrOnly) {
    if (section.value !== 'clients') jobs.push(loadAll());
    // Un cycle de surveillance sans résolution ne modifie ni les manquants ni
    // l'historique. Les garder en place évite le clignotement toutes les minutes.
    if (Number(result.resolved || 0) > 0) {
      if (readsWanted()) jobs.push(loadWanted());
      if (readsHistory()) jobs.push(loadHistory());
    }
  }
  return Promise.allSettled(jobs);
}

let mounted = false;
watch(() => `${section.value}:${subview.value}:${selectedInstanceId.value}:${selectedClientId.value}`, () => {
  if (!mounted) return;
  if (section.value === 'clients') loadClientFilterPreferences(); else resetFilters();
  resetHistory();
  refreshCurrentView();
});
useRealtime(['download.updated'], (_type, detail) => refreshFromDownloadEvent(detail), { debounceMs: 350 });
onMounted(async () => {
  await loadConfigurations();
  if (section.value === 'clients') loadClientFilterPreferences();
  mounted = true;
  await refreshCurrentView({ skipQueue: true });
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.client-header-actions{display:flex;align-items:center;gap:var(--space-2);min-width:0}
.download-source-empty{display:flex;align-items:center;gap:var(--space-4);padding:20px}
.download-source-empty>svg{width:28px;color:var(--accent)}
.download-source-empty>div{flex:1}
.download-source-empty h2{margin:0;font-size:var(--fs-md)}
.download-source-empty p{margin:4px 0 0;color:var(--muted);font-size:var(--fs-sm)}
.client-table-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--space-3)}
@media(max-width:800px){.client-header-actions{width:100%;gap:6px;flex-wrap:wrap}.client-header-actions .badge{display:none}}
@include bp.until(phablet) {.download-source-empty{align-items:flex-start;flex-wrap:wrap}.download-source-empty>div{min-width:calc(100% - 50px)}.download-source-empty>a{margin-left:44px}}
</style>
