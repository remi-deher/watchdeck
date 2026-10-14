<template>
  <!-- Améliorations VF (trois vues dans l'adresse, chacune sur le gabarit de son besoin) :
       releases à remplacer et alignement des pistes sont à traiter (Traiter) ; l'historique
       des cycles de scan est à comprendre (Comprendre). La recherche et les filtres sont ceux
       du socle ; les réglages sont un outil de page. -->
  <PageTemplate
    class="vf-upgrades-page"
    title="Améliorations VF & Flux"
    :tabs="tabs"
    :active-tab="activeTab"
    tabs-label="Modes des améliorations VF"
    v-model:query="query"
    :search="{ placeholder: activeTab === 'upgrades' ? 'Filtrer par film, série ou release…' : 'Filtrer par film ou série…', scope: 'Améliorations VF', kind: 'filter' }"
    :filter-count="activeTab === 'history' ? 0 : activeFilterCount"
    @reset-filters="activeTab === 'audit' ? resetAuditFilters() : resetUpgradeFilters()"
  >
    <template v-if="activeTab !== 'history'" #filters>
      <VfUpgradeFilters
        v-if="activeTab === 'upgrades'"
        v-model:view="viewFilter"
        v-model:media-type="mediaTypeFilter"
        :counts="{ openCount: pendingCount + waitingReleaseCount + inProgressCount + failedCount, historyCount, ignoredCount }"
      />
      <VfAuditFilters v-else v-model:media-type="auditMediaTypeFilter" />
    </template>

    <template #tools>
      <UiButton variant="ghost" icon-only title="Réglages des améliorations VF" aria-label="Réglages des améliorations VF" @click="openSettings">
        <Settings :size="16" />
      </UiButton>
    </template>

    <template v-if="activeTab === 'audit'" #quick-action>
      <UiButton :loading="auditLoading" :disabled="fixingAll" @click="() => loadAudit()"><template #icon><RotateCcw :size="16" /></template>Actualiser l'audit</UiButton>
    </template>

    <!-- Alignement des pistes (Plex) : les anomalies sont les types de probleme, « Aligner les N » l'action groupee. -->
    <HandleTemplate
      v-if="activeTab === 'audit'"
      :items="auditHandleItems"
      :issues="auditIssueList"
      :loading="auditLoading"
      :busy="fixingAll"
      :labels="{ items: 'médias', empty: 'Aucune anomalie de pistes', emptyDetail: 'Toutes les pistes audio et sous-titres sont alignées sur le profil Plex.' }"
      @action="onAuditAction"
      @bulk="onAuditBulk"
    />

    <!-- Releases & remplacements (*arr) : un media par ligne, ce qui n'avance pas sans decision. -->
    <HandleTemplate
      v-else-if="activeTab === 'upgrades'"
      :items="upgradeHandleItems"
      :issues="upgradeIssueList"
      :initial-issue="initialIssue"
      :loading="loading"
      :selection-actions="[{ key: 'scan', label: 'Rechercher la sélection' }]"
      :busy="scanning"
      :labels="{ items: 'médias', empty: 'Aucune amélioration VF à traiter', emptyDetail: 'Aucune suggestion ne correspond à la recherche et aux filtres choisis.' }"
      @action="onUpgradeAction"
      @bulk="onUpgradeBulk"
      @selection="onUpgradeSelection"
    />

    <!-- Historique des cycles de scan : une ligne par cycle, ses recherches dans la feuille. -->
    <UnderstandTemplate
      v-else
      :events="scanEvents"
      :detail="scanDetail"
      :open-key="expandedRunId == null ? '' : String(expandedRunId)"
      :loading="scanRunsLoading"
      :exportable="false"
      empty-title="Aucun cycle de scan"
      empty-message="Aucun cycle de scan enregistré pour le moment."
      @open="onRunOpen"
      @close="onRunClose"
    />

    <!-- Recherche de release d'un media (la fenetre commune), ouverte par « Rechercher une VF ». -->
    <VfUpgradeButton
      v-if="searchSpec"
      :key="searchSpec.key"
      ref="releaseSearch"
      hide-trigger
      :source-type="searchSpec.sourceType"
      :source-id="searchSpec.sourceId"
      :scope="searchSpec.scope"
      :media-title="searchSpec.title"
      @updated="load({ silent: true })"
    />

    <!-- Modale interactive d'alignement des pistes Plex -->
    <AlignStreamsModal
      v-if="alignModalOpen"
      :open="alignModalOpen"
      :item="modalItem"
      @close="alignModalOpen = false"
      @applied="onStreamsAligned"
    />
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { RotateCcw, Settings } from '@lucide/vue';
import { useRealtime } from '@/events';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import HandleTemplate from '@/components/templates/HandleTemplate.vue';
import UnderstandTemplate from '@/components/templates/UnderstandTemplate.vue';
import type { HandleItem } from '@/components/templates/HandleTemplate.vue';
import UiButton from '@/components/ui/UiButton.vue';
import AlignStreamsModal from '@/components/media/AlignStreamsModal.vue';
import VfUpgradeButton from '@/components/media/VfUpgradeButton.vue';
import { etatDeSurface, ouvrirFiche } from '@/composables/useMediaOverlay';
import { useEventListener } from '@vueuse/core';
import VfAuditFilters from '@/components/vf-upgrades/VfAuditFilters.vue';
import VfUpgradeFilters from '@/components/vf-upgrades/VfUpgradeFilters.vue';
import { filterVfUpgradeItems, groupVfUpgradeItems } from '@/utils/vfUpgradeGroups';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { useToast } from '@/composables/useToast';
import { formatRunDuration } from '@/utils/vfUpgradeLabels';
import type { AuditItem, Notify, ScanRun, VfUpgradeEvent } from '@/composables/vf/types';
import type { VfUpgradeGroup } from '@/types/vfUpgrades';
import { useVfAudit } from '@/composables/vf/useVfAudit';
import { useVfScanHistory } from '@/composables/vf/useVfScanHistory';
import { useVfSelection } from '@/composables/vf/useVfSelection';
import { useVfUpgrades } from '@/composables/vf/useVfUpgrades';
import { OPEN_BUCKETS, auditIssues, auditItemToHandle, itemBucket, scanRunDetail, scanRunToEvent, searchTarget, upgradeGroupToHandle, upgradeIssues } from '@/vf/vfHandle';
import { useRoute, useRouter } from 'vue-router';

type VfTab = 'upgrades' | 'audit' | 'history';

/* Les retours (reussite, echec) passent par les notifications, jamais par un bandeau dans la page. */
const { addToast, undoable } = useToast();
const notify: Notify = (message, type = 'success') => addToast({ type: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success', title: 'Améliorations VF', message });

// `useRoute()` ne renvoie rien quand la vue est montee hors routeur (tests unitaires).
const route = useRoute();
const router = useRouter();
/* Un lien peut arriver deja filtre : « 1 échec(s) » sur la page Configuration renvoie ici avec
   `?status=failed`. L'etat devient le type de probleme choisi ; l'historique et les ignores
   sont des affichages a part. */
const requestedStatus = String(route?.query?.status || '');
const initialIssue = ['failed', 'pending', 'waiting_release', 'in_progress'].includes(requestedStatus) ? requestedStatus : '';
const VIEWS: VfTab[] = ['audit', 'upgrades', 'history'];
const localTab = ref<VfTab>('upgrades');
const activeTab = computed<VfTab>(() => {
  if (!route) return localTab.value;
  const asked = String(route.query.vue || '');
  return (VIEWS.includes(asked as VfTab) ? asked : 'upgrades') as VfTab;
});
const viewFilter = ref<string>(['history', 'ignored'].includes(requestedStatus) ? requestedStatus : 'open');
const mediaTypeFilter = ref('');
const query = ref('');
const auditMediaTypeFilter = ref('');

// Releases (*arr) : suggestions, selection et scan groupe.
const upgrades = useVfUpgrades(notify, undoable);
const {
  items, loading, waitingTruncated,
  pendingCount, waitingReleaseCount, inProgressCount, failedCount, historyCount, ignoredCount,
  load, maintenance,
} = upgrades;
const selection = useVfSelection(notify, () => load({ silent: true }));
const { scanning } = selection;

// Alignement des pistes : audit Plex.
const audit = useVfAudit(notify);
const {
  items: auditItems, loading: auditLoading, fixingAll,
  totalCount: auditTotalCount, eligibleFixCount: eligibleAuditFixCount, load: loadAudit,
} = audit;

// Historique des scans.
const history = useVfScanHistory(notify);
const {
  runs: scanRuns, loading: scanRunsLoading, liveScan, expandedRunId, runItems,
  loadRuns: loadScanRuns, toggleRun: toggleRunDetail,
} = history;

// Modale d'alignement unitaire
const alignModalOpen = ref(false);
const modalItem = ref<AuditItem | null>(null);

const tabs = computed(() => [
  { key: 'audit', label: 'Alignement des pistes (Plex)', count: eligibleAuditFixCount.value || auditTotalCount.value },
  { key: 'upgrades', label: 'Releases & Téléchargements (*arr)', count: pendingCount.value || waitingReleaseCount.value },
  { key: 'history', label: 'Historique des scans' },
].map((item) => ({ ...item, to: { path: route?.path || '/vf-upgrades', query: { ...route?.query, vue: item.key } } })));

/* Changer de vue charge ce qu'elle montre : l'audit au premier passage, l'historique a l'ouverture. */
watch(activeTab, (value) => {
  if (value !== 'upgrades') selection.clear();
  if (value === 'audit' && !auditItems.value.length) loadAudit();
  if (value === 'history') history.activate();
  else history.deactivate();
}, { immediate: true });

/* Les reglages s'ouvrent dans la feuille, a leur propre adresse (voir VfSettingsView). Un
   reglage enregistre change ce que les cycles retiennent : on recharge la liste. */
function openSettings(): void {
  ouvrirFiche(router, '/vf-upgrades/settings', route?.fullPath || '/vf-upgrades');
}
useEventListener(window, 'watchdeck:vf-settings-saved', () => { void load({ silent: true }); });

const upgradeDrawer = useFiltersDrawer(
  { viewFilter, mediaTypeFilter, query },
  { viewFilter: 'open', mediaTypeFilter: '', query: '' },
  { memoriser: 'ameliorations-vf-releases', champsMemorises: ['viewFilter', 'mediaTypeFilter'] }
);
const auditDrawer = useFiltersDrawer(
  { auditMediaTypeFilter, query },
  { auditMediaTypeFilter: '', query: '' },
  { memoriser: 'audit-vf', champsMemorises: ['auditMediaTypeFilter'] }
);
const activeFilterCount = computed(() => (activeTab.value === 'upgrades'
  ? Number(viewFilter.value !== 'open') + Number(Boolean(mediaTypeFilter.value))
  : Number(Boolean(auditMediaTypeFilter.value))));
const resetUpgradeFilters = () => upgradeDrawer.reset();
const resetAuditFilters = () => auditDrawer.reset();

/* --- Releases : un media par ligne --- */
const shownItems = computed(() => filterVfUpgradeItems(items.value, query.value, '', mediaTypeFilter.value).filter((item) => {
  const bucket = itemBucket(item);
  return viewFilter.value === 'history' ? bucket === 'history' : viewFilter.value === 'ignored' ? bucket === 'ignored' : (OPEN_BUCKETS as readonly string[]).includes(bucket);
}));
const groups = computed(() => groupVfUpgradeItems(shownItems.value));
const linkTo = (type: 'library' | 'request', id: number | string) => ({ path: `/library/media/${type}/${id}`, state: etatDeSurface(route?.fullPath || '/vf-upgrades') });
const upgradeHandleItems = computed(() => groups.value.map((group) => upgradeGroupToHandle(group, linkTo(group.source_type === 'request' ? 'request' : 'library', group.source_id))));
const upgradeIssueList = computed(() => upgradeIssues(upgradeHandleItems.value, viewFilter.value === 'open' ? waitingTruncated.value : 0));

/* La recherche de release d'un film, d'une serie entiere ou d'une saison se fait d'un geste ; une
   serie suggeree episode par episode se traite dans sa fiche, onglet Audio. */
interface SearchSpec { key: string; sourceType: string; sourceId: number; scope: string; title?: string }
const searchSpec = ref<SearchSpec | null>(null);
const releaseSearch = ref<InstanceType<typeof VfUpgradeButton> | null>(null);
async function openReleaseSearch(spec: Omit<SearchSpec, 'key'>): Promise<void> {
  searchSpec.value = { ...spec, key: `${spec.sourceType}:${spec.sourceId}:${spec.scope}:${Date.now()}` };
  await nextTick();
  releaseSearch.value?.toggle();
}
function groupOf(item: HandleItem): VfUpgradeGroup | undefined {
  return groups.value.find((group) => group.key === item.key);
}
async function onUpgradeAction(item: HandleItem, key: string): Promise<void> {
  const group = groupOf(item);
  if (!group) return;
  if (key === 'ignore' || key === 'reactivate') {
    await upgrades.ignoreMedia(group, key === 'ignore');
    return;
  }
  if (key !== 'search') return;
  const target = searchTarget(group);
  if (target) await openReleaseSearch({ sourceType: group.source_type, sourceId: group.source_id, scope: target.scope, title: group.media?.title });
  else if (item.to) await router.push(item.to as any);
}
async function onUpgradeBulk(key: string): Promise<void> {
  if (key === 'recompute' || key === 'purge') await maintenance(key);
}
async function onUpgradeSelection(key: string, keys: string[]): Promise<void> {
  if (key !== 'scan') return;
  selection.clear();
  keys.forEach((groupKey) => selection.toggle(groupKey));
  await selection.scanSelected();
}

/* --- Alignement des pistes : un media par ligne --- */
const auditFilteredItems = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return auditItems.value.filter((item) => (!needle || (item.title || '').toLowerCase().includes(needle))
    && (!auditMediaTypeFilter.value || item.media_type === auditMediaTypeFilter.value));
});
const auditHandleItems = computed(() => auditFilteredItems.value.map((item) => auditItemToHandle(item, linkTo('library', item.id))));
const auditIssueList = computed(() => auditIssues(auditFilteredItems.value));
const auditOf = (item: HandleItem) => auditItems.value.find((entry) => `audit-${entry.id}` === item.key);
function onAuditAction(item: HandleItem, key: string): void {
  const entry = auditOf(item);
  if (!entry) return;
  if (key === 'align') openAlignModal(entry);
  else if (key === 'search-vf') void openReleaseSearch({ sourceType: 'library_item', sourceId: entry.id, scope: entry.media_type === 'movie' ? 'movie' : 'show', title: entry.title });
  else if (key === 'search-subtitles') void audit.searchSubtitles(entry);
}
/* « Aligner les N » : les medias de cette anomalie, filtres compris. */
function onAuditBulk(_key: string, issue: string): void {
  const concerned = auditHandleItems.value.filter((handle) => handle.issue === issue).map(auditOf).filter((entry): entry is AuditItem => Boolean(entry));
  void audit.fixAll(concerned);
}
function openAlignModal(item: AuditItem): void {
  modalItem.value = item;
  alignModalOpen.value = true;
}
function onStreamsAligned({ item, res }: { item: AuditItem; res?: { users_count?: number; parts_processed?: number } }): void {
  const userMsg = (res?.users_count ?? 0) > 1 ? ` pour ${res?.users_count} profils Plex` : '';
  const partsMsg = (res?.parts_processed ?? 0) > 1 ? `${res?.parts_processed} parties` : 'le média';
  notify(`Pistes réalignées avec succès sur Plex sur ${partsMsg}${userMsg}.`);
  audit.applyStreamsFixInPlace(item.id);
}

/* --- Historique : un cycle par ligne, ses recherches en detail --- */
const scanEvents = computed(() => scanRuns.value.map((run) => scanRunToEvent(run, liveScan.value as any)));
const expandedRun = computed<ScanRun | null>(() => scanRuns.value.find((run) => run.id === expandedRunId.value) || null);
const scanDetail = computed(() => (expandedRun.value
  ? scanRunDetail(expandedRun.value, runItems.value, formatRunDuration(expandedRun.value.started_at, expandedRun.value.finished_at))
  : null));
function onRunOpen(event: { key: string }): void {
  const run = scanRuns.value.find((entry) => String(entry.id) === event.key);
  if (run) void toggleRunDetail(run);
}
function onRunClose(): void {
  if (expandedRun.value) void toggleRunDetail(expandedRun.value);
}

// Branchement temps réel SSE ciblé par composant
useRealtime(['vf_upgrade.updated'], (_type, detail) => {
  const payload: VfUpgradeEvent = detail?.payload || detail || {};

  // 1. Mise à jour chirurgicale in-place sur un média d'audit précis (aucun rechargement global)
  if (payload.type === 'streams_aligned' && payload.item_id) {
    audit.applyStreamsFixInPlace(payload.item_id, payload);
    return;
  }
  if (payload.type === 'streams_aligned_batch' && Array.isArray(payload.item_ids)) {
    payload.item_ids.forEach((id) => audit.applyStreamsFixInPlace(id));
    return;
  }

  // 2. Si un cycle d'upgrade unitaire évolue
  if (payload.id && payload.status && upgrades.patchStatus(payload.id, payload.status, payload.arr_message)) return;

  // 3. Rechargement discret en arrière-plan uniquement si un scan complet est terminé
  if (payload.action === 'scan_completed') {
    load({ silent: true });
    if (activeTab.value === 'audit') loadAudit({ silent: true });
    if (activeTab.value === 'history') loadScanRuns();
  }
});
</script>

<style scoped lang="scss">
.vf-upgrades-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
