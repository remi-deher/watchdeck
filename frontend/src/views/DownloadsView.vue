<template>
  <div class="page downloads-page">
    <PageSearchHeader
      :title="pageTitle"
      :description="['radarr', 'sonarr'].includes(section) ? '' : pageDescription"
      v-model:query="query"
      :placeholder="searchPlaceholder"
      has-filters
      :active-count="totalActiveFilterCount"
      :filters-open="filtersOpen"
      @toggle-filters="filtersOpen = !filtersOpen"
    >
      <template v-if="['radarr', 'sonarr'].includes(section)" #status>
        <TabNav class="arr-title-tabs" :model-value="subview" :tabs="subnavTabs" :aria-label="`Navigation secondaire — ${pageTitle}`" @update:model-value="selectSubview" />
      </template>
      <template v-if="section==='clients'&&subview==='instances'&&!sourceNeedsConfiguration" #actions>
        <div class="client-header-actions">
          <span class="badge">{{ filteredClients.length }} torrent(s)</span>
          <UiButton variant="primary" size="sm" title="Ajouter un torrent" @click="showAddModal = true"><template #icon><Plus /></template>Ajouter un torrent</UiButton>
          <UiButton size="sm" icon-only title="Personnaliser les colonnes" aria-label="Personnaliser les colonnes" @click="clientTable?.openColumnPicker()"><Columns /></UiButton>
        </div>
      </template>
    </PageSearchHeader>

    <div class="psh-layout">
      <FilterSidebar :open="filtersOpen" :active-count="totalActiveFilterCount" @close="filtersOpen=false" @reset="resetAllFilters">
        <FilterGroup v-if="!['clients', 'radarr', 'sonarr'].includes(section)" label="Affichage">
          <button v-for="tab in subnavTabs" :key="tab.value" class="filter-badge" :class="{ active: subview === tab.value }" @click="selectSubview(tab.value)"><span>{{ tab.label }}</span></button>
        </FilterGroup>

        <template v-if="section==='clients'">
          <FilterGroup label="Vue">
            <button class="filter-badge" :class="{ active: subview === 'instances' }" @click="selectSubview('instances')"><span>Torrents</span></button>
            <button class="filter-badge" :class="{ active: subview === 'overview' }" @click="selectSubview('overview')"><span>Synthèse</span></button>
          </FilterGroup>

          <template v-if="subview==='instances'">
            <TorrentSidebarFilters
              :rows="clientQueue"
              :active-status="status"
              :active-category="clientCategory"
              :active-client="selectedClientName"
              :active-tracker="clientTracker"
              @update:status="status = $event"
              @update:category="clientCategory = $event"
              @update:client="setClientFilter($event[0] || '')"
              @update:tracker="clientTracker = $event"
              @reset="resetClientFilters"
            />
            <FilterGroup label="Origine">
              <button class="filter-badge" :class="{ active: !clientOwnership }" @click="clientOwnership = ''"><span>Toutes</span></button>
              <button class="filter-badge" :class="{ active: clientOwnership === 'watchdeck' }" @click="clientOwnership = clientOwnership === 'watchdeck' ? '' : 'watchdeck'"><span>Watchdeck</span></button>
              <button class="filter-badge" :class="{ active: clientOwnership === 'external' }" @click="clientOwnership = clientOwnership === 'external' ? '' : 'external'"><span>Externes</span></button>
            </FilterGroup>
          </template>
        </template>

        <template v-else>
          <FilterGroup v-if="instances.length > 1" label="Instance">
            <button class="filter-badge" :class="{ active: !instance }" @click="instance = ''"><span>Toutes</span></button>
            <button v-for="val in instances" :key="val" class="filter-badge" :class="{ active: instance === val }" @click="instance = instance === val ? '' : val"><span>{{ val }}</span></button>
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
          v-if="['radarr', 'sonarr'].includes(section) && subview!=='missing'"
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

        <UnmatchedImportsBanner v-if="!['clients', 'radarr', 'sonarr'].includes(section)" :items="unmatchedItems" :row-key="rowKey" @view-all="openUnmatched" @associate="openManual"/>

        <UiFeedback v-if="error" type="error" title="Chargement partiel" :message="error" retry @retry="loadAll"/>
        <UiFeedback v-if="loading&&!queue.length" type="loading" message="Chargement des téléchargements…"/>
        <section v-if="sourceNeedsConfiguration" class="panel download-source-empty">
          <component :is="section==='radarr'?Film:section==='sonarr'?Tv:Server" />
          <div><h2>{{ section==='clients'?'Aucun client torrent configuré':'Aucune instance '+(section==='radarr'?'Radarr':'Sonarr')+' configurée' }}</h2><p>Cette source reste facultative et n’empêche pas le suivi des autres téléchargements.</p></div>
          <UiButton variant="primary" :to="{path:'/settings',query:{tab:'services'}}"><template #icon><Plus/></template>Ajouter une instance</UiButton>
        </section>

        <!-- Vue file active (Radarr/Sonarr/Overview) -->
        <section v-if="section!=='clients'&&!showHistory&&!sourceNeedsConfiguration&&subview!=='missing'" class="download-groups" role="tabpanel">
          <section v-for="group in queueGroups" :key="group.key" class="download-group" :class="group.key">
            <header class="download-group-head"><div><component :is="group.icon"/><div><h2>{{ group.title }}</h2><p>{{ group.description }}</p></div></div><span>{{ group.items.length }}</span></header>
            <div class="download-card-grid">
              <article v-for="row in group.items" :key="rowKey(row)" class="download-card rich-card">
                <div class="card-cover-col">
                  <div class="card-cover-wrapper">
                    <img
                      v-if="row.poster_url && !hasPosterError(row)"
                      :src="proxyUrl(row.poster_url, { width: 200 }) ?? undefined"
                      :alt="row.title"
                      class="card-cover-img"
                      loading="lazy"
                      @error="onPosterError(row)"
                    />
                    <div class="card-cover-placeholder">
                      <Film v-if="row.arr_type==='radarr'" />
                      <Tv v-else-if="row.arr_type==='sonarr'" />
                      <Download v-else />
                    </div>
                  </div>
                </div>
                <div class="card-content-col">
                  <header>
                    <div>
                      <strong>{{ row.title }}</strong>
                      <div class="card-sub-badges">
                        <small>{{ row.instance||row.download_client||'Téléchargement direct' }}</small>
                        <span v-if="extractQuality(row)" class="badge quality-badge">{{ extractQuality(row) }}</span>
                      </div>
                    </div>
                    <span class="badge" :class="group.key==='intervention'?'failed':'pending'">{{ statusLabel(row) }}</span>
                  </header>
                  <div class="download-progress">
                    <div><span>Progression</span><strong>{{ Math.round(row.progress||0) }}%</strong></div>
                    <progress :value="row.progress||0" max="100" :aria-label="`Progression de ${row.title}`"></progress>
                    <div class="progress-details">
                      <small>{{ row.timeleft||'Temps restant indisponible' }}</small>
                      <small v-if="row.sizeleft_label">{{ row.sizeleft_label }}</small>
                    </div>
                  </div>
                  <div v-if="row.waiting_reason||row.error" class="download-callout" :class="{error:row.error}">{{ row.error||row.waiting_reason }}</div>
                  <div v-if="row.origin_label||row.operational_status_label" class="download-meta">{{ row.origin_label }}<template v-if="row.operational_status_label"> · {{ row.operational_status_label }}</template></div>
                  <footer>
                    <UiButton v-if="queueDetailPath(row)" size="sm" :to="queueDetailPath(row) ?? '/'">Voir la fiche</UiButton>
                    <UiButton v-if="requiresIntervention(row)" size="sm" @click="openManual(row)"><template #icon><Link/></template>Associer / importer</UiButton>
                    <UiButton v-if="canAct(row)" size="sm" :disabled="actingKeys.has(rowKey(row))" @click="queueAction(row,true,true)"><template #icon><RotateCcw/></template>Relancer</UiButton>
                    <UiButton v-if="canAct(row)" variant="danger" size="sm" :disabled="actingKeys.has(rowKey(row))" @click="queueAction(row,false,false)"><template #icon><X/></template>Retirer</UiButton>
                  </footer>
                </div>
              </article>
            </div>
          </section>

          <!-- Si aucun téléchargement en cours dans la sous-vue 'all', afficher les derniers éléments terminés avec leurs posters -->
          <div v-if="subview==='all' && !queueGroups.length && !loading" class="recent-completed-section">
            <HorizontalRail
              v-if="filteredHistory.length"
              aria-label="Derniers éléments terminés"
              variant="poster"
            >
              <template #header>
                <div class="section-subtitle">
                  <CheckCircle2 />
                  <h3>Derniers éléments terminés</h3>
                </div>
              </template>

              <MediaCardShell
                v-for="(row, index) in filteredHistory.slice(0, 10)"
                :key="row.id"
                :has-action="Boolean(queueDetailPath(row))"
                action-padding="44px"
                elevate-on-hover
                animated
                bordered
                :style="{ '--card-index': index }"
              >
                <template #default="{ revealed, reveal }">
                  <component
                    :is="queueDetailPath(row) ? 'RouterLink' : 'div'"
                    :to="queueDetailPath(row)"
                    class="poster-link"
                    :aria-label="`${row.title}${row.year ? ' (' + row.year + ')' : ''} - ${historyModeLabel(row)}`"
                    @click="handleCompletedCardClick($event, row, revealed, reveal)"
                  >
                    <MediaPoster
                      :poster-url="row.poster_url && !hasPosterError(row) ? proxyUrl(row.poster_url, { width: 320 }) : null"
                      :alt="`Affiche de ${row.title}`"
                      @error="onPosterError(row)"
                    >
                      <template #badges>
                        <div class="poster-badges completed-badge-group">
                          <span class="badge" :class="historyModeClass(row)">{{ historyModeLabel(row) }}</span>
                          <span v-if="row.instance_name || row.source" class="badge badge-source">{{ row.instance_name || row.source }}</span>
                        </div>
                      </template>
                      <template #overlay>
                        <div class="poster-overlay completed-card-overlay">
                          <div class="poster-copy">
                            <div class="poster-meta">
                              <span v-if="row.year" class="meta-year">{{ row.year }}</span>
                              <span>{{ mediaTypeLabel(row.media_type) }}</span>
                              <span v-if="row.completed_at" class="meta-date">{{ formatDate(row.completed_at) }}</span>
                            </div>
                            <strong class="completed-title">{{ row.title }}</strong>
                          </div>
                        </div>
                      </template>
                    </MediaPoster>
                  </component>
                </template>

                <template v-if="queueDetailPath(row)" #action>
                  <RouterLink
                    :to="queueDetailPath(row) ?? '/'"
                    class="poster-action nav-action"
                    @click.stop
                  >
                    Voir la fiche
                  </RouterLink>
                </template>
              </MediaCardShell>
            </HorizontalRail>
            <p v-else class="empty">Aucun téléchargement récent pour cette vue.</p>
          </div>
          <p v-else-if="!loading&&!filteredQueue.length&&subview!=='all'" class="empty">Aucun téléchargement actif.</p>
        </section>

        <!-- Vue Médias manquants / recherchés pour Radarr / Sonarr -->
        <section v-else-if="['radarr','sonarr'].includes(section)&&subview==='missing'&&!sourceNeedsConfiguration" class="panel wanted-section" role="tabpanel">
          <div class="panel-head">
            <div>
              <h3>Éléments manquants</h3>
              <p>Cliquez sur un élément pour ouvrir sa fiche dans Bibliothèque et gérer son suivi.</p>
            </div>
            <span class="badge">{{ missingItemCount }} item(s)</span>
          </div>
          <div v-if="wantedItems.length" class="media-grid missing-items-grid" aria-label="Éléments manquants">
            <MissingSeriesCard
              v-for="series in section==='sonarr' ? missingSeriesGroups : []"
              :key="`series-${series.instance_id}-${series.arr_id}`"
              :series="series"
              @error="setSourceError('wanted', $event)"
            />
            <LibraryCard
              v-for="item in section==='radarr' ? wantedItems : []"
              :key="`wanted-${item.instance_id}-${item.id}`"
              :item="wantedLibraryItem(item)"
              @error="setSourceError('wanted', $event)"
            />
          </div>
          <p v-else-if="!loadingWanted" class="empty">Aucun élément manquant signalé.</p>
        </section>

        <section v-else-if="section==='clients'&&subview==='instances'&&!sourceNeedsConfiguration" class="client-table-main" role="tabpanel">
          <UiFeedback v-for="row in clientErrors" :key="row.client_id" type="error" :title="row.client_name" :message="row.client_error"/>
          <TorrentClientsTable ref="clientTable" :rows="filteredClients" :client-id="selectedClientId" :preference-scope="selectedClientId || 'all'" @refresh="loadClients" @error="setSourceError('clients', $event)" @add-file="handleDroppedFile" />
          <p v-if="!loading&&!filteredClients.length&&!clientErrors.length" class="empty">Aucun torrent ne correspond aux filtres actifs.</p>
        </section>

        <div v-else-if="section==='clients'&&subview==='overview'" aria-hidden="true" />

        <!-- Vue Historique avec jaquettes posters -->
        <section v-else class="panel table-wrap table-cards rich" role="tabpanel">
          <UiFeedback v-for="row in historyErrors" :key="row.instance_id" type="error" :title="row.instance_name" message="Historique temporairement indisponible pour cette instance."/>
          <table>
            <thead><tr><th>Titre</th><th>Type</th><th>Traitement</th><th>Source</th><th>Instance</th><th>Terminé</th></tr></thead>
            <tbody>
              <tr v-for="row in filteredHistory" :key="row.id">
                <td class="card-title">
                  <div class="history-item-wrap">
                    <div class="history-poster-thumb">
                      <img
                        v-if="row.poster_url && !hasPosterError(row)"
                        :src="proxyUrl(row.poster_url, { width: 120 }) ?? undefined"
                        :alt="row.title"
                        class="history-poster-img"
                        loading="lazy"
                        @error="onPosterError(row)"
                      />
                      <div v-else class="history-poster-fallback">
                        <Film v-if="row.media_type==='movie'" />
                        <Tv v-else />
                      </div>
                    </div>
                    <div>
                      <strong>{{ row.title }}</strong>
                      <small v-if="row.year">{{ row.year }}</small>
                    </div>
                  </div>
                </td>
                <td data-label="Type">{{ mediaTypeLabel(row.media_type) }}</td>
                <td data-label="Traitement"><span class="badge" :class="historyModeClass(row)">{{ historyModeLabel(row) }}</span></td>
                <td data-label="Source"><span class="badge">{{ row.source }}</span></td>
                <td data-label="Instance">{{ row.instance_name||'-' }}</td>
                <td data-label="Terminé">{{ formatDate(row.completed_at) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!filteredHistory.length" class="empty">Aucun téléchargement terminé.</p>
          <LoadMore :has-more="hasMoreHistory" :loading="loadingHistory" @load="loadMoreHistory"/>
        </section>
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->

    <AddTorrentModal :open="showAddModal" :clients="configuredClients" :initial-file="droppedFile" @close="showAddModal = false; droppedFile = null" @added="loadClients" />
    <ManualImportModal v-if="manualRow" :row="manualRow" @close="manualRow=null" @submitted="onManualSubmitted"/>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)"/>
  </div>
</template>

<script setup lang="ts">
import PageSearchHeader from '@/components/ui/PageSearchHeader.vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import TabNav from '@/components/ui/TabNav.vue';
import LoadMore from '@/components/ui/LoadMore.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import { mediaTypeLabel } from '@/utils/labels';
import { formatDateTime as formatDate } from '@/utils/format';
import { computed,onMounted,ref,shallowRef,watch } from 'vue';
import { useRoute,useRouter } from 'vue-router';
import { AlertTriangle,CheckCircle2,Clock3,Columns,Download,Film,Link,Plus,RotateCcw,Server,SlidersHorizontal,Tv,X } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { useConfirm } from '@/composables/useConfirm';
import { useLatestRequest } from '@/composables/useLatestRequest';
import { useDownloadSources } from '@/composables/useDownloadSources';
import { proxyUrl } from '@/utils/mediaImage';
import {
  canAct,
  isUnmatched,
  needsEpisodeImport,
  queueCounts,
  queueDetailPath,
  requiresIntervention,
  rowKey,
  statusKey,
  statusLabel,
} from '@/downloads/queueRules';
import UnmatchedImportsBanner from '@/components/downloads/UnmatchedImportsBanner.vue';
import ManualImportModal from '@/components/downloads/ManualImportModal.vue';
import AddTorrentModal from '@/components/downloads/AddTorrentModal.vue';
import TorrentClientsTable from '@/components/downloads/TorrentClientsTable.vue';
import TorrentSidebarFilters from '@/components/downloads/TorrentSidebarFilters.vue';
import TorrentOverviewDashboard from '@/components/downloads/TorrentOverviewDashboard.vue';
import DownloadsOverview from '@/components/downloads/DownloadsOverview.vue';
import ArrDownloadsLayout from '@/components/downloads/ArrDownloadsLayout.vue';
import LibraryCard from '@/components/library/LibraryCard.vue';
import MissingSeriesCard from '@/components/downloads/MissingSeriesCard.vue';
import HorizontalRail from '@/components/ui/HorizontalRail.vue';
import MediaCardShell from '@/components/media/MediaCardShell.vue';
import MediaPoster from '@/components/media/MediaPoster.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';

const route=useRoute(),router=useRouter();
const arrQueue=ref<any[]>([]),directQueue=ref<any[]>([]),clientQueue=shallowRef<any[]>([]),history=shallowRef<any[]>([]),diskSpaceVolumes=ref<any[]>([]),failedPosterIds=ref<Set<string>>(new Set());
const prowlarrStats=ref<Record<string, any>>({}),clientOverviewStats=ref<Record<string, any>>({});
const { arrInstances:configuredArr,downloadClients:configuredClients,loading:configurationsLoading,error:configurationError,load:loadDownloadSources }=useDownloadSources();
const query=ref(''),instance=ref(''),status=ref<string | string[]>(''),statusFilter=ref(''),clientCategory=ref<string | string[]>(''),clientOwnership=ref(''),clientTracker=ref<string | string[]>('');
const clientTable=ref<any>(null),showAddModal=ref(false),droppedFile=ref<File | null>(null);
const filtersOpen=ref(localStorage.getItem('watchdeck:torrent-filter-sidebar-collapsed')!=='true');

function handleCompletedCardClick(e: Event, row: any, revealed: boolean, reveal: () => void): void {
  if (queueDetailPath(row) && !revealed) {
    e.preventDefault();
    reveal();
  }
}

function handleDroppedFile(file: File): void {
  droppedFile.value = file;
  showAddModal.value = true;
}
watch(filtersOpen, v => {
  localStorage.setItem('watchdeck:torrent-filter-sidebar-collapsed', String(!v));
});

function hasPosterError(row: any): boolean {
  return failedPosterIds.value.has(posterKey(row));
}

function onPosterError(row: any): void {
  failedPosterIds.value = new Set([...failedPosterIds.value, posterKey(row)]);
}

function posterKey(row: any): string {
  return [row.arr_type || row.source || row.media_type || 'media', row.instance_id || row.client_id || '', row.id || row.arr_id || row.queue_id || row.hash || row.poster_url || row.title].join(':');
}

function parseSearchQuery(qStr: string) {
  const terms: string[] = [];
  const filters: { cat: string | null; tag: string | null; is: string | null; tracker: string | null } = { cat: null, tag: null, is: null, tracker: null };
  const parts = qStr.trim().split(/\s+/);

  for (const part of parts) {
    if (part.includes(':')) {
      const [key, val] = part.split(':');
      const k = key.toLowerCase();
      const v = val.toLowerCase();
      if (k === 'cat' || k === 'category') filters.cat = v;
      else if (k === 'tag' || k === 'tags') filters.tag = v;
      else if (k === 'is' || k === 'status') filters.is = v;
      else if (k === 'tracker' || k === 'host') filters.tracker = v;
      else terms.push(part.toLowerCase());
    } else if (part) {
      terms.push(part.toLowerCase());
    }
  }
  return { terms: terms.join(' '), filters };
}

function setClientFilter(name: string) {
  const found = configuredClients.value.find((c: any) => c.name === name);
  if (found) {
    router.replace({ path: '/downloads', query: { ...route.query, client: String(found.id) } });
  } else {
    const q: Record<string, any> = { ...route.query };
    delete q.client;
    router.replace({ path: '/downloads', query: q });
  }
}
const manualRow=ref<any>(null),loading=ref(false),loadingHistory=ref(false),historyErrors=ref<any[]>([]);
const sourceErrors=ref<Record<string, string>>({ queue:'', clients:'', wanted:'', history:'', configuration:'', disk:'', action:'', ui:'' });
const error=computed({
  get:(): string =>{
    const relevant=['configuration','action','ui'];
    if(section.value!=='clients')relevant.push('queue');
    if(['overview','clients'].includes(section.value))relevant.push('clients');
    if(section.value==='overview'||['radarr','sonarr'].includes(section.value))relevant.push('wanted');
    if(section.value==='overview'||showHistory.value||(['radarr','sonarr'].includes(section.value)&&subview.value==='all'))relevant.push('history');
    if(section.value==='overview')relevant.push('disk');
    return relevant.map(key=>sourceErrors.value[key]).filter(Boolean).join(' · ');
  },
  set:(value: string)=>setSourceError('ui',value),
});
function setSourceError(source: string,value=''){sourceErrors.value={...sourceErrors.value,[source]:value||''}}
const hiddenItems=ref<Set<string>>(new Set()),actingKeys=ref<Set<string>>(new Set()),hasMoreHistory=ref(false);
const {dialog:confirmDialog,askConfirm,resolveConfirm}=useConfirm();
const HISTORY_PAGE_SIZE=100;
const request=useLatestRequest();

const filteredSectionArrInstances = computed(() => {
  if (!['radarr', 'sonarr'].includes(section.value)) return [];
  return configuredArr.value.filter((inst: any) => inst.arr_type === section.value && (!selectedInstanceId.value || String(inst.id) === selectedInstanceId.value));
});


function extractQuality(row: any): string {
  const quality = row?.quality;
  const explicit = typeof quality === 'string'
    ? quality
    : quality?.quality?.name || quality?.name || row?.quality_label || row?.quality_name;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const match = String(row?.title || '').match(/\b(2160p|1080p|720p|576p|480p|4k|uhd)\b/i);
  return match?.[1]?.toUpperCase() || '';
}

async function loadDiskSpace(): Promise<void> {
  try {
    diskSpaceVolumes.value = await api('/api/disk-space');
    setSourceError('disk');
  } catch (e: any) {
    setSourceError('disk', `Stockage : ${e.message}`);
  }
}

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

const missingSeriesGroups = computed(() => {
  const groups = new Map<string, any>();
  for (const episode of wantedItems.value.filter((item: any) => item.arr_type === 'sonarr')) {
    const key = `${episode.instance_id}:${episode.arr_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        arr_id: episode.arr_id,
        instance_id: episode.instance_id,
        instance_name: episode.instance_name,
        title: episode.series_title || episode.title,
        poster_url: episode.poster_url,
        media_type: 'show',
        episodes: [],
      });
    }
    groups.get(key).episodes.push(episode);
  }
  return [...groups.values()].map(series => ({
    ...series,
    episodes: series.episodes.sort((a: any,b: any) => (a.season_number - b.season_number) || (a.episode_index - b.episode_index)),
  })).sort((a,b) => a.title.localeCompare(b.title, 'fr'));
});
const missingItemCount = computed(() => section.value === 'sonarr' ? missingSeriesGroups.value.length : wantedItems.value.length);

async function loadWanted(): Promise<void> {
  if (section.value !== 'overview' && !['radarr', 'sonarr'].includes(section.value)) return;
  const loadVersion = ++wantedLoadVersion;
  if (!wantedItems.value.length) loadingWanted.value = true;
  try {
    const params = new URLSearchParams({ arr_type: section.value });
    if (selectedInstanceId.value) params.set('instance_id', selectedInstanceId.value);
    const rows = await api(`/api/arr/wanted?${params}`);
    if (loadVersion === wantedLoadVersion) { wantedItems.value = rows; setSourceError('wanted'); }
  } catch (e: any) {
    if (loadVersion === wantedLoadVersion) setSourceError('wanted', `Éléments manquants : ${e.message}`);
  } finally {
    if (loadVersion === wantedLoadVersion) loadingWanted.value = false;
  }
}

function wantedLibraryItem(item: any) {
  return {
    ...item,
    _kind: 'request',
    orphan: true,
    orphan_source: item.arr_type,
    arr_instance_id: item.instance_id,
    status: 'sent_to_arr',
    title: item.episode_number ? `${item.title} · ${item.episode_number}` : item.title,
  };
}


const section=computed((): string =>['queue','radarr','sonarr','clients'].includes(String(route.query.view))?String(route.query.view):'overview');
const validSubviews: Record<string, string[]> ={
  overview:['all','active','waiting','completed','errors'],
  queue:['all','active','waiting','intervention'],
  radarr:['all','active','waiting','missing','completed','errors'],
  sonarr:['all','active','waiting','missing','completed','errors'],
  clients:['overview','instances']
};
const subview=computed((): string =>validSubviews[section.value].includes(String(route.query.sub))?String(route.query.sub):section.value==='clients'?'overview':'all');
const selectedClientId=computed(()=>route.query.client?String(route.query.client):'');
const selectedInstanceId=computed(()=>route.query.instance?String(route.query.instance):'');
const pageTitle=computed(()=>{
  if (section.value==='radarr') return selectedInstanceName.value || 'Radarr';
  if (section.value==='sonarr') return selectedInstanceName.value || 'Sonarr';
  if (section.value==='clients') return selectedClientName.value || 'Tous';
  return 'Tous';
});
const pageDescription=computed(()=>({overview:'Vue d’ensemble de l’activité et des derniers téléchargements.',queue:'Suivi opérationnel consolidé de toutes les acquisitions.',radarr:'Téléchargements suivis par les instances Radarr.',sonarr:'Téléchargements suivis par les instances Sonarr.',clients:''})[section.value]);
const sourceErrorCount=computed(()=>section.value==='clients'?clientErrors.value.length:errorItems.value.filter(row=>(!['radarr','sonarr'].includes(section.value)||row.arr_type===section.value)&&(!selectedInstanceId.value||String(row.instance_id)===selectedInstanceId.value)).length);
const standardTabs=computed(()=>[
  {value:'all',label:'Vue d’ensemble'},
  {value:'active',label:'En cours'},
  {value:'waiting',label:'En attente'},
  {value:'missing',label:'Éléments manquants',count:missingItemCount.value},
  {value:'completed',label:'Terminés'},
  {value:'errors',label:'Erreurs',count:sourceErrorCount.value,badgeClass:'error-badge'}
 ]);
const subnavTabs=computed(()=>section.value==='overview'?[{value:'all',label:'Tous'},{value:'active',label:'En cours'},{value:'waiting',label:'En attente'},{value:'completed',label:'Terminés'},{value:'errors',label:'Erreurs',count:errorItems.value.length,badgeClass:'error-badge'}]:section.value==='queue'?[{value:'all',label:'Toute la file'},{value:'active',label:'En cours'},{value:'waiting',label:'En attente'},{value:'intervention',label:'Interventions',count:counts.value.intervention,badgeClass:'error-badge'}]:section.value==='clients'?[{value:'overview',label:'Vue d’ensemble'},{value:'instances',label:selectedClientName.value||'Instances'}]:standardTabs.value);
const showHistory=computed(()=>subview.value==='completed'&&section.value!=='clients'&&section.value!=='queue');

const queue=computed(()=>[...arrQueue.value,...directQueue.value].filter((row: any)=>!hiddenItems.value.has(rowKey(row))).sort((a: any,b: any)=>(a.progress||0)-(b.progress||0)));

const instances=computed(()=>{
  if(['radarr','sonarr'].includes(section.value)) return configuredArr.value.filter((row: any)=>row.enabled&&row.arr_type===section.value).map((row: any)=>row.name);
  if(section.value==='clients') return configuredClients.value.filter((row: any)=>row.enabled).map((row: any)=>row.name);
  return [...new Set(queue.value.map((x: any)=>x.instance||x.download_client).filter(Boolean))];
});
const unmatchedItems=computed(()=>queue.value.filter((row: any)=>(!['radarr','sonarr'].includes(section.value)||row.arr_type===section.value)&&(!selectedInstanceId.value||String(row.instance_id)===selectedInstanceId.value)&&(isUnmatched(row)||needsEpisodeImport(row))));
const errorItems=computed(()=>queue.value.filter((row: any)=>statusKey(row)==='error'));
const filteredQueue=computed(()=>{const activeStatus=status.value||statusFilter.value;const needle=query.value.trim().toLocaleLowerCase('fr');return queue.value.filter((row: any)=>{const key=statusKey(row);const sourceMatch=!['radarr','sonarr'].includes(section.value)||row.arr_type===section.value;const selectedMatch=!selectedInstanceId.value||String(row.instance_id)===selectedInstanceId.value;const contextual=subview.value==='active'?key==='downloading':subview.value==='waiting'?['queued','paused','completed'].includes(key):subview.value==='errors'?key==='error':subview.value==='intervention'?requiresIntervention(row):true;return sourceMatch&&selectedMatch&&contextual&&(!needle||row.title?.toLocaleLowerCase('fr').includes(needle))&&(!instance.value||(row.instance||row.download_client)===instance.value)&&(activeStatus==='unmatched'?(isUnmatched(row)||needsEpisodeImport(row)):!activeStatus||key===activeStatus)})});
const selectedInstanceName=computed(()=>configuredArr.value.find((row: any)=>String(row.id)===selectedInstanceId.value)?.name||'');
const filteredHistory=computed(()=>{const needle=query.value.trim().toLocaleLowerCase('fr');return history.value.filter((row: any)=>(!['radarr','sonarr'].includes(section.value)||row.source===section.value)&&(!selectedInstanceName.value||row.instance_name===selectedInstanceName.value)&&(!needle||row.title?.toLocaleLowerCase('fr').includes(needle)))});
const clientErrors=computed(()=>clientQueue.value.filter((row: any)=>row.client_error&&(!selectedClientId.value||String(row.client_id)===selectedClientId.value)));
const clientCategories=computed(()=>[...new Set(clientQueue.value.filter((row: any)=>!selectedClientId.value||String(row.client_id)===selectedClientId.value).map((row: any)=>row.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr')));
function clientStatus(row: any): string {const value=String(row.status||'').toLowerCase();if(row.client_error||value.includes('error')||value.includes('missing'))return'error';if(Number(row.progress)>=100||['uploading','stalledup','pausedup','completed'].some(key=>value.includes(key)))return'seeding';if(['queued','paused','stopped','checking'].some(key=>value.includes(key)))return'paused';return'downloading'}

function matchFilterValue(filter: any, val: any, isSubstring = false): boolean {
  if (!filter) return true;
  let set: Set<any> = new Set();
  if (filter instanceof Set) set = filter;
  else if (Array.isArray(filter)) set = new Set(filter.filter(Boolean));
  else if (typeof filter === 'string' && filter.trim()) set = new Set([filter.trim()]);

  if (!set.size) return true;

  const valStr = String(val || '').toLowerCase();
  const included=[...set].filter(item=>!String(item).startsWith('!'));
  const excluded=[...set].filter(item=>String(item).startsWith('!')).map(item=>String(item).slice(1));
  const matches=(item: any)=>isSubstring?valStr.includes(String(item).toLowerCase()):valStr===String(item).toLowerCase();
  if(excluded.some(matches)) return false;
  if(!included.length) return true;
  for (const item of included) {
    const itemStr = String(item).toLowerCase();
    if (isSubstring) {
      if (valStr.includes(itemStr)) return true;
    } else {
      if (valStr === itemStr) return true;
    }
  }
  return false;
}

const filteredClients=computed(()=>{
  const { terms, filters } = parseSearchQuery(query.value);
  return clientQueue.value.filter((row: any) => {
    if (row.client_error) return false;
    if (selectedClientId.value && String(row.client_id) !== selectedClientId.value) return false;
    if (terms && !`${row.title || ''} ${row.tags || ''}`.toLowerCase().includes(terms)) return false;

    const catTarget = filters.cat || clientCategory.value;
    if (!matchFilterValue(catTarget, row.category || 'Non classé')) return false;

    const tagTarget = filters.tag;
    if (tagTarget && !(row.tags || '').toLowerCase().includes(tagTarget)) return false;

    const isTarget = filters.is || status.value;
    if (!matchFilterValue(isTarget, clientStatus(row))) return false;

    const trackerTarget = filters.tracker || clientTracker.value;
    if (!matchFilterValue(trackerTarget, row.trackers || row.tracker || '', true)) return false;

    if (clientOwnership.value && row.managed_by !== clientOwnership.value) return false;
    return true;
  });
});
const selectedClientName=computed(()=>configuredClients.value.find((row: any)=>String(row.id)===selectedClientId.value)?.name||clientQueue.value.find((row: any)=>String(row.client_id)===selectedClientId.value)?.client_name||'');
const sourceNeedsConfiguration=computed(()=>!configurationsLoading.value&&(section.value==='clients'?configuredClients.value.filter((row: any)=>row.enabled).length===0:['radarr','sonarr'].includes(section.value)&&!configuredArr.value.some((row: any)=>row.enabled&&row.arr_type===section.value)));
const queueGroups=computed(()=>{const intervention=filteredQueue.value.filter(requiresIntervention),ids=new Set(intervention.map(rowKey)),remaining=filteredQueue.value.filter((row: any)=>!ids.has(rowKey(row)));return[{key:'intervention',title:'Intervention requise',description:'Import bloqué, erreur ou média à associer',icon:AlertTriangle,items:intervention},{key:'active',title:'En téléchargement',description:'Transferts actuellement en progression',icon:Download,items:remaining.filter((row: any)=>statusKey(row)==='downloading')},{key:'waiting',title:'En attente',description:'Éléments en file ou temporairement en pause',icon:Clock3,items:remaining.filter((row: any)=>['queued','paused','completed'].includes(statusKey(row)))}].filter(group=>group.items.length)});
const counts=computed(()=>queueCounts(queue.value));
const searchPlaceholder=computed(()=>{
  if(section.value==='clients') return 'Rechercher un torrent (ex: cat:radarr is:downloading)…';
  if(section.value==='radarr') return 'Filtrer les films…';
  if(section.value==='sonarr') return 'Filtrer les séries…';
  return 'Filtrer les téléchargements…';
});
const activeFilterCount=computed(()=>[query.value,instance.value,status.value||statusFilter.value,clientCategory.value,clientOwnership.value,clientTracker.value].filter(v => Array.isArray(v) ? v.length : Boolean(v)).length);
const activeClientFilterCount=computed(()=>[query.value,status.value,clientCategory.value,clientOwnership.value,clientTracker.value].filter(v => Array.isArray(v) ? v.length : Boolean(v)).length);
const totalActiveFilterCount=computed(()=>section.value==='clients'?activeClientFilterCount.value:[query.value,instance.value,status.value||statusFilter.value].filter(Boolean).length);
const resultCount=computed(()=>section.value==='clients'?filteredClients.value.length:subview.value==='missing'?missingItemCount.value:showHistory.value?filteredHistory.value.length:filteredQueue.value.length);
function selectSubview(value: string){statusFilter.value='';router.replace({path:'/downloads',query:{...route.query,view:section.value,sub:value}})}
function selectClientDashboard(client: any){router.replace({path:'/downloads',query:{view:'clients',sub:'instances',client:client.id}})}
function openUnmatched(){router.replace({path:'/downloads',query:{view:'queue',sub:'intervention'}});statusFilter.value='unmatched'}
function resetFilters(){query.value='';instance.value='';status.value='';statusFilter.value='';clientCategory.value='';clientOwnership.value='';clientTracker.value=''}
function resetClientFilters(){query.value='';status.value=[];clientCategory.value=[];clientOwnership.value='';clientTracker.value=[]}
function resetAllFilters(){resetFilters();resetClientFilters()}

async function loadAll(): Promise<void>{
  const {signal,isCurrent}=request.begin();if(!queue.value.length)loading.value=true;setSourceError('queue');
  const options={signal};
  const results=await Promise.allSettled([api('/api/arr/queue',options),api('/api/downloads/direct',options)]);
  if(!isCurrent())return;
  const labels=['File Sonarr/Radarr','Téléchargements directs'],failures: string[]=[];
  results.forEach((result,index)=>{if(result.status==='rejected'&&!request.isAbort(result.reason))failures.push(`${labels[index]} : ${result.reason.message}`)});
  if(results[0].status==='fulfilled')arrQueue.value=results[0].value;
  if(results[1].status==='fulfilled')directQueue.value=results[1].value;
  setSourceError('queue',failures.join(' · '));loading.value=false;
}
let clientLoadVersion = 0;
async function loadClients(): Promise<void>{
  const loadVersion = ++clientLoadVersion;
  try {
    const rows = await api('/api/downloads/clients');
    // Les événements peuvent arriver en rafale : une réponse plus ancienne ne doit pas
    // écraser la liste plus récente et provoquer un clignotement du tableau.
    if (loadVersion === clientLoadVersion) { clientQueue.value = rows; setSourceError('clients'); }
  } catch (e: any) {
    if (loadVersion === clientLoadVersion) setSourceError('clients', `Clients torrent : ${e.message}`);
  }
}
async function loadConfigurations(): Promise<void>{await loadDownloadSources();setSourceError('configuration',configurationError.value)}
let historyLoadVersion=0;
async function loadHistory(): Promise<void>{
  const loadVersion=++historyLoadVersion;
  const url=historyUrl(0);
  if(!history.value.length)loadingHistory.value=true;
  try{
    const payload=await api(url);if(loadVersion!==historyLoadVersion)return;const rows=payload.items||payload;
    history.value=rows;
    historyErrors.value=payload.errors||[];
    hasMoreHistory.value=rows.length===HISTORY_PAGE_SIZE;
    setSourceError('history');
  }catch(e: any){if(loadVersion===historyLoadVersion)setSourceError('history',`Historique : ${e.message}`)}
  finally{if(loadVersion===historyLoadVersion)loadingHistory.value=false}
}
function historyUrl(offset: number): string{const params=new URLSearchParams({limit:String(HISTORY_PAGE_SIZE),offset:String(offset)});if(['radarr','sonarr'].includes(section.value))params.set('source',section.value);if(selectedInstanceId.value)params.set('instance_id',selectedInstanceId.value);return`/api/downloads/history?${params}`}
function historyModeLabel(row: any): string{return row.processing_mode==='automatic'?'Automatique':row.processing_mode==='manual'?'Import manuel':'Détecté par Watchdeck'}
function historyModeClass(row: any): string{return row.processing_mode==='automatic'?'available':row.processing_mode==='manual'?'pending':''}
async function loadMoreHistory(): Promise<void>{if(loadingHistory.value||!hasMoreHistory.value)return;const loadVersion=historyLoadVersion;const url=historyUrl(history.value.length);loadingHistory.value=true;try{const payload=await api(url);if(loadVersion!==historyLoadVersion)return;const rows=payload.items||payload;history.value=[...history.value,...rows];historyErrors.value=payload.errors||[];hasMoreHistory.value=rows.length===HISTORY_PAGE_SIZE;setSourceError('history')}catch(e: any){if(loadVersion===historyLoadVersion)setSourceError('history',`Historique : ${e.message}`)}finally{if(loadVersion===historyLoadVersion)loadingHistory.value=false}}
async function queueAction(row: any,blocklist: boolean,search: boolean): Promise<void>{if(!await askConfirm({title:blocklist?'Blocklister ce téléchargement ?':'Retirer ce téléchargement ?',message:blocklist?'Le fichier sera blocklisté et une nouvelle recherche sera lancée.':'Le téléchargement sera retiré de la file.',confirmLabel:blocklist?'Blocklister et rechercher':'Retirer',danger:true}))return;const key=rowKey(row);actingKeys.value=new Set([...actingKeys.value,key]);try{await api(`/api/arr/queue/${row.instance_id}/${row.queue_id}?blocklist=${blocklist}&search=${search}`,{method:'DELETE'});setSourceError('action');await loadAll()}catch(e: any){setSourceError('action',e.message)}finally{const next=new Set(actingKeys.value);next.delete(key);actingKeys.value=next}}
function openManual(row: any): void{manualRow.value=row}
async function onManualSubmitted(): Promise<void>{hiddenItems.value.add(rowKey(manualRow.value));manualRow.value=null;await loadAll()}

function refreshCurrentView(){
  const jobs: Promise<any>[]=[];
  if(section.value!=='clients') jobs.push(loadAll());
  if(section.value==='overview'||section.value==='clients') jobs.push(loadClients());
  if(section.value==='overview'||['radarr','sonarr'].includes(section.value)) jobs.push(loadWanted());
  if(section.value==='overview'||showHistory.value||(['radarr','sonarr'].includes(section.value)&&subview.value==='all')) jobs.push(loadHistory());
  if(section.value==='overview') jobs.push(loadDiskSpace(),loadOverviewInstanceStats());
  return Promise.allSettled(jobs);
}
function refreshFromDownloadEvent(detail: any={}){
  const job=detail?.job||'';
  const result=detail?.result||{};
  const torrentOnly=Boolean(detail?.client_id)||job==='torrent-statuses';
  const arrOnly=['sonarr-queue-monitor','radarr-queue-monitor'].includes(job);
  // Les actions utilisateur sans job sont ponctuelles : on actualise uniquement
  // les données opérationnelles, jamais l'historique immuable de la vue d'ensemble.
  if(!torrentOnly&&!arrOnly){
    const jobs: Promise<any>[]=[];
    if(section.value!=='clients')jobs.push(loadAll());
    if(['overview','clients'].includes(section.value))jobs.push(loadClients());
    return Promise.allSettled(jobs);
  }
  const jobs: Promise<any>[]=[];
  if(torrentOnly){
    if(['overview','clients'].includes(section.value))jobs.push(loadClients());
  }
  if(arrOnly){
    if(section.value!=='clients')jobs.push(loadAll());
    // Un cycle de surveillance sans résolution ne modifie ni les manquants ni
    // l'historique. Les garder en place évite le clignotement toutes les minutes.
    if(Number(result.resolved||0)>0){
      if(section.value==='overview'||['radarr','sonarr'].includes(section.value))jobs.push(loadWanted());
      if(section.value==='overview'||showHistory.value||(['radarr','sonarr'].includes(section.value)&&subview.value==='all'))jobs.push(loadHistory());
    }
  }
  return Promise.allSettled(jobs);
}
let mounted=false;
const clientFilterScope=computed(()=>selectedClientId.value||'all');
function clientFilterStorageKey(){return`watchdeck:torrent-filters:${clientFilterScope.value}`}
function loadClientFilterPreferences(){
  try{
    const saved=JSON.parse(localStorage.getItem(clientFilterStorageKey())||'null');
    if(!saved){resetClientFilters();return}
    query.value=saved.query||'';status.value=saved.status||[];clientCategory.value=saved.category||[];clientOwnership.value=saved.ownership||'';clientTracker.value=saved.tracker||[];
  }catch{resetClientFilters()}
}
watch([query,status,clientCategory,clientOwnership,clientTracker],()=>{
  if(section.value!=='clients')return;
  localStorage.setItem(clientFilterStorageKey(),JSON.stringify({query:query.value,status:status.value,category:clientCategory.value,ownership:clientOwnership.value,tracker:clientTracker.value}));
},{deep:true});
watch(()=>`${section.value}:${subview.value}:${selectedInstanceId.value}:${selectedClientId.value}`,()=>{
  if(!mounted)return;
  if(section.value==='clients')loadClientFilterPreferences();else resetFilters();hasMoreHistory.value=false;refreshCurrentView();
});
useRealtime(['download.updated'],(_type,detail)=>refreshFromDownloadEvent(detail),{debounceMs:350});
onMounted(async()=>{await loadConfigurations();if(section.value==='clients')loadClientFilterPreferences();mounted=true;await refreshCurrentView()});
</script>

<style scoped lang="scss">

.wanted-section{display:grid;gap:var(--space-3);padding:16px}
.wanted-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:var(--space-3)}
.wanted-card{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface)}
.wanted-poster-wrap{width:42px;height:62px;border-radius:var(--radius-sm);overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.wanted-poster-img{width:100%;height:100%;object-fit:cover}
.wanted-poster-fallback svg{width:18px;height:18px;color:var(--muted)}
.wanted-info{display:flex;flex-direction:column;gap:3px;min-width:0}
.wanted-info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--fs-xs)}
.wanted-info small{color:var(--muted);font-size:11px}

.client-header-actions{display:flex;align-items:center;gap:var(--space-2);min-width:0}.client-table-search{width:180px;height:40px}.client-header-actions .icon-button{display:inline-grid;place-items:center;width:40px;height:40px;padding:0}.client-header-actions .icon-button svg{width:18px;height:18px}.client-header-actions .icon-button.active{border-color:var(--accent);color:var(--accent)}.client-filter-toggle{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:0 11px;white-space:nowrap}.client-filter-toggle svg{width:17px;height:17px}.client-filter-toggle.active{border-color:var(--accent);color:var(--accent)}.filter-count{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:var(--radius-pill);background:var(--accent);color:#1a1400;font-size:11px}.client-header-speeds{display:inline-flex;align-items:center;gap:10px}.client-header-speeds span{display:inline-flex;align-items:center;gap:5px;color:var(--accent);font-size:var(--fs-xs);white-space:nowrap}.client-header-speeds svg{width:15px;height:15px}.client-header-speeds strong{color:var(--text);font-size:var(--fs-sm)}.torrent-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-2);margin:0}.torrent-stats div{display:grid;gap:2px;padding:8px;border-radius:var(--radius-sm);background:var(--surface-2)}.torrent-stats dt{color:var(--muted);font-size:var(--fs-xs)}.torrent-stats dd{margin:0;font-size:var(--fs-sm);font-weight:700}@media(max-width:800px){.torrent-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.client-header-actions{width:100%;gap:6px;flex-wrap:wrap}.client-table-search{flex:1 1 180px;width:auto}.client-header-actions .badge{display:none}.client-filter-toggle{flex:0 1 auto}.client-header-speeds{gap:7px}.client-header-speeds strong{font-size:var(--fs-xs)}}
.sidebar-ownership-filter{display:grid;gap:6px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-md);font-size:var(--fs-xs);font-weight:700}.sidebar-ownership-filter select{width:100%}
:deep(.filter-sidebar-bare){top:92px;max-height:calc(100dvh - 108px)}
.add-torrent-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;font-size:var(--fs-xs);height:34px;white-space:nowrap;border-radius:var(--radius-sm)}
.add-torrent-btn svg{width:14px;height:14px}
.download-source-empty{display:flex;align-items:center;gap:var(--space-4);padding:20px}.download-source-empty>svg{width:28px;color:var(--accent)}.download-source-empty>div{flex:1}.download-source-empty h2{margin:0;font-size:var(--fs-md)}.download-source-empty p{margin:4px 0 0;color:var(--muted);font-size:var(--fs-sm)}.download-source-empty>a{display:inline-flex;align-items:center;gap:var(--space-2);text-decoration:none}.download-source-empty>a svg{width:15px}@media(max-width:640px){.download-source-empty{align-items:flex-start;flex-wrap:wrap}.download-source-empty>div{min-width:calc(100% - 50px)}.download-source-empty>a{margin-left:44px}}
.download-groups{display:grid;gap: var(--space-4)}.download-group{display:grid;gap: var(--space-3)}.download-group-head{display:flex;align-items:center;justify-content:space-between;padding:0 2px}.download-group-head>div{display:flex;align-items:center;gap: var(--space-3)}.download-group-head svg{width:19px;color:var(--muted)}.download-group.intervention .download-group-head svg{color:var(--danger)}.download-group-head h2{margin:0;font-size:var(--fs-md)}.download-group-head p{margin:2px 0 0;color:var(--muted);font-size:var(--fs-xs)}.download-group-head>span{min-width:27px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius-pill);text-align:center;font-size:var(--fs-xs);font-weight:700}.download-card{display:grid;gap: var(--space-3);padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);content-visibility:auto;contain-intrinsic-size:0 120px}
.history-card{border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);padding:12px;content-visibility:auto;contain-intrinsic-size:0 120px}.download-card>header,.download-progress>div,.download-card footer{display:flex;align-items:flex-start;justify-content:space-between;gap: var(--space-3)}.download-card>header>div{display:grid;gap: var(--space-1);min-width:0}.download-card>header strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.download-card>header small,.download-progress small,.download-meta{color:var(--muted);font-size:var(--fs-xs)}.download-progress{display:grid;gap: var(--space-2)}.download-progress span{color:var(--muted);font-size:var(--fs-xs)}.download-progress strong{font-size:var(--fs-sm)}.download-progress progress{width:100%;height:7px}.download-callout{padding:8px 10px;border-radius:var(--radius-sm);background:rgba(229,160,13,.09);color:var(--accent);font-size:var(--fs-xs)}.download-callout.error{background:rgba(239,68,68,.09);color:var(--danger)}.download-card footer{justify-content:flex-end;flex-wrap:wrap;margin-top:auto}.download-card footer button,.download-card footer a{display:inline-flex;align-items:center;gap: var(--space-2);padding:7px 9px;font-size:var(--fs-xs);text-decoration:none}.download-card footer svg{width:14px;height:14px}.load-more{display:flex;justify-content:center;padding:16px}
.rich-card{display:flex;gap:var(--space-3);align-items:stretch}.card-cover-col{width:70px;flex-shrink:0}.card-cover-wrapper{position:relative;width:100%;aspect-ratio:2/3;border-radius:var(--radius-sm);overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center}.card-cover-img{width:100%;height:100%;object-fit:cover}.card-cover-placeholder{color:var(--muted)}.card-cover-placeholder svg{width:22px;height:22px}.card-content-col{flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--space-2)}.card-sub-badges{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.quality-badge{background:color-mix(in srgb, var(--accent) 15%, transparent);color:var(--accent);font-size:10px;padding:2px 6px}.progress-details{display:flex;justify-content:space-between;align-items:center;gap:6px}
.history-item-wrap{display:flex;align-items:center;gap:10px}
.history-poster-thumb{width:36px;height:52px;border-radius:var(--radius-sm);overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.history-poster-img{width:100%;height:100%;object-fit:cover}
.history-poster-fallback svg{width:16px;height:16px;color:var(--muted)}
.recent-completed-section{display:grid;gap:var(--space-3);margin-top:var(--space-3)}
.section-subtitle{display:flex;align-items:center;gap:8px;color:var(--success)}
.section-subtitle svg{width:18px;height:18px}
.section-subtitle h3{margin:0;font-size:var(--fs-md);color:var(--text)}
.completed-badge-group{display:flex;gap:5px;flex-wrap:wrap}
.completed-badge-group .badge-source{background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);color:var(--text);border:1px solid rgba(255,255,255,0.15)}
.completed-card-overlay .meta-year{color:#fff;font-weight:700}
.completed-card-overlay .meta-date{color:rgba(255,255,255,0.75);font-size:11px}
.completed-title{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.missing-items-grid{margin-top:var(--space-4)}

.client-table-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--space-3)}
@media(max-width:800px){.download-card-grid,.history-grid-cards{grid-template-columns:1fr 1fr}}@media(max-width:520px){.download-group-head p{display:none}.download-card{padding:12px}.rich-card{flex-direction:column}.card-cover-col{width:100%}.card-cover-wrapper{aspect-ratio:16/9}.download-card footer{display:grid;grid-template-columns:1fr 1fr}.download-card footer button,.download-card footer a{justify-content:center}}
@media(max-width:767.98px){.client-header-actions{width:100%;flex-wrap:wrap}.client-table-search{flex:1 1 100%;width:auto;height:44px}.client-header-actions .icon-button{width:44px;height:44px}.client-filter-toggle{flex:1 1 auto;min-height:44px}.client-header-speeds{width:100%;justify-content:space-between}.download-card-grid,.history-grid-cards,.wanted-grid{grid-template-columns:1fr}.download-card footer{grid-template-columns:1fr}.download-card footer button,.download-card footer a{justify-content:center;min-height:44px}}
</style>
