<template>
  <!-- Clients torrent : deux vues d'une même section. Les torrents (gabarit Gérer) : lesquels
       tournent, et que faut-il en faire (pause, revérification, classement, retrait) ? La
       synthèse (gabarit Surveiller) : les clients répondent-ils, et que font-ils ? Les débits
       et la connexion sont en retour de la capsule, l'ajout d'un torrent en est l'action. -->
  <PageTemplate
    :title="clientName || 'Clients'"
    :tabs="TABS"
    :active-tab="sub"
    tabs-label="Vues des clients"
    v-model:query="query"
    :search="isTorrents ? { placeholder: 'Filtrer les torrents (ex: cat:radarr is:downloading)…', scope: 'Acquisition', kind: 'filter' } : null"
    :match-count="isTorrents ? rows.length : null"
    :total-count="isTorrents ? scoped.length : null"
    :filter-count="isTorrents ? filterCount : 0"
    :state="state"
    :error="error"
    :unconfigured="UNCONFIGURED"
    @retry="reload"
    @reset-filters="reset"
  >
    <template v-if="isTorrents" #filters>
      <!-- Trois états par pastille : un appui inclut, le suivant exclut, le troisième libère. -->
      <FilterGroup v-if="facets.status.length" label="Statut">
        <UiChipGroup label="Statut" exclusion :options="facets.status" :model-value="asArray(status)" @update:model-value="status = $event" />
      </FilterGroup>
      <FilterGroup v-if="facets.category.length" label="Catégorie">
        <UiChipGroup label="Catégorie" exclusion :options="facets.category" :model-value="asArray(category)" @update:model-value="category = $event" />
      </FilterGroup>
      <FilterGroup v-if="facets.client.length > 1" label="Client">
        <UiChipGroup label="Client" :options="[{ value: '', label: 'Tous' }, ...facets.client]" :model-value="clientName" @update:model-value="selectClient" />
      </FilterGroup>
      <FilterGroup v-if="facets.tracker.length" label="Tracker" :default-open="false" :value="asArray(tracker).join(', ')">
        <UiChipGroup label="Tracker" exclusion :options="facets.tracker" :model-value="asArray(tracker)" @update:model-value="tracker = $event" />
      </FilterGroup>
      <FilterGroup label="Origine">
        <UiChipGroup label="Origine" :options="OWNERSHIP" v-model="ownership" />
      </FilterGroup>
    </template>
    <template v-if="isTorrents" #tools><TorrentsCommandBar :client-id="clientId" /></template>
    <template v-if="isTorrents" #quick-action>
      <UiButton title="Ajouter un torrent" @click="showAdd = true"><template #icon><Plus /></template>Ajouter un torrent</UiButton>
    </template>

    <ManageTemplate
      v-if="isTorrents"
      :key="scope"
      class="torrent-table"
      label="Tableau des torrents"
      :rows="rows"
      :columns="TORRENT_COLUMNS"
      :row-key="torrentKey"
      :row-label="(row: any) => row.title"
      :loading="pending"
      :labels="{ singular: 'torrent sélectionné', plural: 'torrents sélectionnés', empty: 'Aucun torrent ne correspond aux filtres actifs.' }"
      :bulk-actions="TORRENT_BULK_ACTIONS"
      :global-actions="displayActions"
      :row-actions="rowActions"
      :inline-actions="0"
      :notices="notices"
      :initial-sort="{ key: 'title', direction: 'asc' }"
      :columns-key="`watchdeck:torrent-table-columns:${scope}`"
      :default-visible="TORRENT_DEFAULT_COLUMNS"
      :density="compact ? 'compact' : 'comfortable'"
      resizable
      reorderable
      openable
      context-menu
      :batch="100"
      @open="openDetails"
      @action="onAction"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <template #cell-title="{ row, index }">
        <button class="torrent-title" @click.stop="openDetails(row)">{{ incognito ? maskTitle(row.title, Number(index)) : row.title }}</button>
        <small class="torrent-sub">{{ row.client_name }}<template v-if="row.tags"> · {{ row.tags }}</template></small>
      </template>
      <template #cell-status="{ row }"><TorrentStateBadge :torrent="row" /></template>
      <template #cell-progress="{ row }">
        <div class="torrent-progress"><UiProgress :value="row.progress || 0" :label="`Progression de ${row.title}`" /><span>{{ Math.round(row.progress || 0) }} %</span></div>
      </template>
      <template #cell-size="{ row }">{{ formatBytes(row.size) }}</template>
      <template #cell-download_speed="{ row }">{{ formatSpeed(row.download_speed) }}</template>
      <template #cell-upload_speed="{ row }">{{ formatSpeed(row.upload_speed) }}</template>
      <template #cell-ratio="{ row }">{{ Number(row.ratio || 0).toFixed(2) }}</template>
      <template #cell-eta="{ row }">{{ formatEta(row.eta) }}</template>
      <template #cell-category="{ row }">{{ row.category || '—' }}</template>
      <template #cell-trackers="{ row }">
        <span class="torrent-tracker">
          <img v-if="trackerOf(row) && !favicons.failed(row)" :src="favicons.url(row)" alt="" loading="lazy" @error="favicons.hide(row)" />
          <span>{{ formatTracker(trackerOf(row)) }}</span>
        </span>
      </template>
      <template #cell-added_on="{ row }">{{ formatTimestamp(row.added_on) }}</template>
      <template #cell-completed_on="{ row }">{{ formatTimestamp(row.completed_on) }}</template>
    </ManageTemplate>

    <MonitorTemplate
      v-else
      :items="overview.items"
      :kpis="overview.kpis"
      :zones="overview.zones"
      :icons="{ client: Server }"
      :loading="pending"
      :labels="{ okTitle: 'Les clients répondent', okDetail: 'Aucun client hors ligne.', kpisLabel: 'Indicateurs des clients torrent', zonesLabel: 'Clients torrent', checkingTitle: 'Lecture des clients…' }"
    >
      <template v-if="overview.trackers.length" #details>
        <UiDataTable label="Répartition par tracker" :rows="overview.trackers" :columns="TRACKER_COLUMNS" :row-key="(tracker: any) => tracker.name">
          <template #cell-upload="{ row }">{{ formatSpeed(row.uploadSpeed) }}</template>
          <template #cell-download="{ row }">{{ formatSpeed(row.downloadSpeed) }}</template>
          <template #cell-ratio="{ row }">{{ (row.ratioSum / row.count).toFixed(2) }}</template>
          <template #cell-size="{ row }">{{ formatPreciseBytes(row.size) }}</template>
        </UiDataTable>
      </template>
    </MonitorTemplate>

    <CreateTemplate
      :open="showAdd"
      :definition="addDefinition"
      :values="droppedFile ? { source: 'file', file: droppedFile } : null"
      @close="showAdd = false; droppedFile = null"
      @created="reload"
    />
    <CreateTemplate :open="Boolean(metaTargets)" :definition="metaDefinition" mode="edit" :values="metaValues" @close="metaTargets = null" />
    <TorrentMetadataModal :open="showMetadata" :clients="enabledClients" :metadata="metadata" @close="showMetadata = false" />
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Gauge, Minimize2, EyeOff, Plus, Server, Tags } from '@lucide/vue';
import { useTorrentClients } from '@/composables/useTorrentClients';
import { useTorrentSpeeds } from '@/composables/useTorrentSpeeds';
import { torrentKey } from '@/composables/useTorrentActions';
import { formatBytes, formatEta, formatSpeed, formatTimestamp, formatTracker, maskTitle } from '@/downloads/torrentFormat';
import { torrentOverview } from '@/downloads/torrentOverview';
import { formatPreciseBytes } from '@/utils/format';
import PageTemplate, { type PageState } from '@/components/templates/PageTemplate.vue';
import ManageTemplate from '@/components/templates/ManageTemplate.vue';
import MonitorTemplate from '@/components/templates/MonitorTemplate.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import { torrentCreation } from '@/creations/torrent';
import { useTorrentMetadata } from '@/composables/useTorrentMetadata';
import TorrentMetadataModal from '@/components/downloads/TorrentMetadataModal.vue';
import { torrentMetaEdit } from '@/creations/torrentMetadata';
import TorrentStateBadge from '@/components/downloads/TorrentStateBadge.vue';
import TorrentsCommandBar from '@/components/downloads/TorrentsCommandBar.vue';
import { TORRENT_BULK_ACTIONS, TORRENT_COLUMNS, TORRENT_DEFAULT_COLUMNS, torrentRowActions } from '@/components/downloads/torrentDefinitions';

const route = useRoute();
const {
  clientId, clientName, selectClient, configured, enabledClients, configurationLoading,
  torrents, rows, scoped, pending, error, reload,
  query, status, category, tracker, ownership, reset, filterCount, facets, asArray,
  stale, clientErrors, compact, incognito, isBusy, metaTargets, saveMeta, run, openDetails,
} = useTorrentClients();
const speeds = useTorrentSpeeds(clientId);

/* Deux vues : les torrents (par défaut, via l'adresse) et la synthèse. */
const sub = computed(() => (route.query.sub === 'instances' ? 'instances' : 'overview'));
const isTorrents = computed(() => sub.value === 'instances');
const TABS = [
  { key: 'instances', label: 'Torrents', to: { path: '/downloads', query: { view: 'clients', sub: 'instances' } } },
  { key: 'overview', label: 'Synthèse', to: { path: '/downloads', query: { view: 'clients', sub: 'overview' } } },
];
const OWNERSHIP = [{ value: '', label: 'Toutes' }, { value: 'watchdeck', label: 'Watchdeck' }, { value: 'external', label: 'Externes' }];
const UNCONFIGURED = {
  title: 'Aucun client torrent configuré',
  message: 'Cette source reste facultative et n’empêche pas le suivi des autres téléchargements.',
  icon: Server,
  actionTo: '/settings/services/integrations',
  actionLabel: 'Ajouter un client',
};
const state = computed<PageState>(() => {
  if (!configurationLoading.value && enabledClients.value.length === 0) return 'unconfigured';
  return error.value && !torrents.value.length ? 'error' : 'ready';
});

/* Les colonnes se retiennent par client. */
const scope = computed(() => clientId.value || 'all');

/* Ce que le tableau propose en plus des actions : les modes d'affichage et la vitesse. */
const displayActions = computed(() => [
  { key: 'alt-speed', label: 'Mode alternatif', icon: Gauge, pressed: speeds.altSpeed.value, title: 'Limites de vitesse alternatives (mode tortue)' },
  { key: 'compact', label: 'Compact', icon: Minimize2, pressed: compact.value, title: 'Affichage compact' },
  { key: 'metadata', label: 'Catégories et tags', icon: Tags, title: 'Créer, renommer ou supprimer les catégories et tags du client' },
  { key: 'incognito', label: 'Discret', icon: EyeOff, pressed: incognito.value, title: 'Masquer les noms des torrents' },
]);
const rowActions = (row: any) => torrentRowActions(row).map((action) => ({ ...action, disabled: isBusy(row) }));
function onAction(key: string, targets: any[]): void {
  if (key === 'alt-speed') speeds.toggleAltSpeed();
  else if (key === 'metadata') showMetadata.value = true;
  else run(key, targets);
}

const notices = computed(() => [
  ...(stale.value ? [{ key: 'stale', type: 'warning' as const, title: 'Mode données en cache local', message: `Le client torrent ${stale.value.client_name} est momentanément injoignable. (Dernière synchro : il y a ${stale.value.stale_since_seconds} sec)` }] : []),
  ...clientErrors.value.map((row: any) => ({ key: `client-${row.client_id}`, type: 'error' as const, title: row.client_name, message: row.client_error })),
]);

/* Un fichier .torrent glissé sur la liste ouvre l'ajout, déjà rempli. */
const showAdd = ref(false);
const droppedFile = ref<File | null>(null);
/* Ce que chaque client connaît (catégories, tags) est lu à l'ouverture, pour le proposer. */
const metadata = useTorrentMetadata();
watch(showAdd, (open) => { if (open) void metadata.loadAll(configured.value.filter((client: any) => client.enabled).map((client: any) => client.id)); });
/* Classement de la sélection : préremplie depuis le premier torrent, avec ce que son client connaît. */
const showMetadata = ref(false);
const metaClient = computed(() => metaTargets.value?.[0]?.client_id);
watch(metaClient, (id) => { if (id != null) void metadata.load(id); });
const metaValues = computed(() => ({ category: metaTargets.value?.[0]?.category || '', tags: metaTargets.value?.[0]?.tags || '' }));
const metaDefinition = computed(() => torrentMetaEdit(metadata.of(metaClient.value), metaTargets.value?.length || 0, saveMeta));
const addDefinition = computed(() => torrentCreation({ clients: configured.value.filter((client: any) => client.enabled), metadata: metadata.of, ensure: metadata.ensure }));
function onDrop(event: DragEvent): void {
  const file = event.dataTransfer?.files?.[0];
  if (!file?.name.endsWith('.torrent')) return;
  droppedFile.value = file;
  showAdd.value = true;
}

const overview = computed(() => torrentOverview(configured.value, torrents.value, clientId.value));
const TRACKER_COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Tracker', card: 'title', sortable: true },
  { key: 'count', label: 'Torrents', sortable: true },
  { key: 'upload', label: 'Envoi', sortable: true, sortValue: (row: any) => row.uploadSpeed },
  { key: 'download', label: 'Téléchargement', sortable: true, sortValue: (row: any) => row.downloadSpeed },
  { key: 'ratio', label: 'Ratio', sortable: true, sortValue: (row: any) => row.ratioSum / row.count },
  { key: 'size', label: 'Taille', sortable: true },
];

/* Le favicon d'un tracker qui ne répond pas n'est pas redemandé. */
const trackerOf = (row: any): string => row.trackers || row.tracker || '';
const failedFavicons = ref<Set<string>>(new Set());
const faviconKey = (row: any) => formatTracker(trackerOf(row)).toLocaleLowerCase('fr');
const favicons = {
  url: (row: any) => `/api/downloads/tracker-favicon?tracker=${encodeURIComponent(String(trackerOf(row)).split(',')[0].trim())}`,
  failed: (row: any) => failedFavicons.value.has(faviconKey(row)),
  hide: (row: any) => { failedFavicons.value = new Set([...failedFavicons.value, faviconKey(row)]); },
};
</script>

<style scoped lang="scss">
.torrent-title { display: block; max-width: 100%; overflow: hidden; padding: 0; border: 0; background: transparent; color: var(--text); font: inherit; font-weight: 700; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.torrent-title:hover { color: var(--accent); text-decoration: underline; }
.torrent-sub { display: block; overflow: hidden; margin-top: 3px; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.torrent-progress { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; min-width: 0; }
.torrent-tracker { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.torrent-tracker img { width: 14px; height: 14px; flex: 0 0 14px; border-radius: var(--radius-xs); object-fit: contain; }
.torrent-tracker span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
