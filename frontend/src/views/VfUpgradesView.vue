<template>
    <AppPage
      title="Améliorations VF & Flux"
      v-model:query="query"
      :placeholder="activeTab === 'upgrades' ? 'Filtrer par film, série ou release…' : 'Filtrer par film ou série…'"
      has-filters
      :active-count="activeFilterCount"
      :filters-open="filtersOpen"
      @toggle-filters="toggleFilters" page-class="vf-upgrades-page">

      <template #tools>
        <UiButton
          variant="ghost"
          icon-only
          title="Réglages des améliorations VF"
          aria-label="Réglages des améliorations VF"
          @click="openSettings"
        >
          <Settings :size="16" />
        </UiButton>
        <template v-if="activeTab === 'upgrades'">
          <UiButton v-if="selectedKeys.size > 0" variant="primary" :loading="scanning" @click="scanSelected"><template #icon><ScanSearch :size="16" /></template>{{ scanning ? 'Recherche en cours…' : `Rechercher la sélection (${selectedKeys.size})` }}</UiButton>
        </template>
        <template v-else>
          <UiButton
            v-if="eligibleAuditFixCount > 0"
            variant="primary"
            :loading="fixingAll"
            :disabled="auditLoading"
            title="Aligner les pistes de tous les médias audités pour tous les profils Plex"
            @click="fixAllStreams"
          >
            <template #icon><SlidersHorizontal :size="16" /></template>{{ fixingAll ? 'Alignement en cours…' : `Tout aligner (${eligibleAuditFixCount})` }}
          </UiButton>
          <UiButton :loading="auditLoading" :disabled="fixingAll" @click="() => loadAudit()"><template #icon><RotateCcw :size="16" /></template>Actualiser l'audit</UiButton>
        </template>
      </template>

    <!-- Les modes de la page rejoignent la rangee collante, a cote des outils : centres
         sur l'axe de la recherche et toujours a portee pendant le defilement. -->
    <template #tabs>
      <AppSubnav variant="tabs"
        :active="activeTab"
        :items="tabs"
        aria-label="Modes des améliorations VF"
        @update:active="selectTab"
      />
    </template>

    <template v-if="activeTab !== 'history'">
      <VfUpgradeKpiBanner
        :audit="activeTab === 'audit'"
        :active-filter="activeTab === 'audit' ? auditIssueFilter : statusFilter"
        :audit-counts="auditCounts"
        :eligible-audit-fix-count="eligibleAuditFixCount"
        :pending-count="pendingCount"
        :waiting-release-count="waitingReleaseCount"
        :in-progress-count="inProgressCount"
        :failed-count="failedCount"
        :history-count="historyCount"
        :ignored-count="ignoredCount"
        @select="activeTab === 'audit' ? toggleAuditFilter($event) : toggleStatusFilter($event)"
      />
    </template>

    <div class="psh-layout">
      <!-- Tiroir de filtres de l'onglet Releases (et maintenance) -->
      <VfUpgradeFilters
        v-if="activeTab === 'upgrades'"
        v-model:status="statusFilter"
        v-model:media-type="mediaTypeFilter"
        :open="filtersOpen"
        :active-count="activeFilterCount"
        :counts="{ pendingCount, waitingReleaseCount, inProgressCount, failedCount, historyCount, ignoredCount }"
        @maintenance="maintenance"
        @close="closeFilters"
        @reset="resetUpgradeFilters"
      />
      <!-- Tiroir de filtres de l'onglet Audit -->
      <VfAuditFilters
        v-else-if="activeTab === 'audit'"
        v-model:issue="auditIssueFilter"
        v-model:media-type="auditMediaTypeFilter"
        :open="filtersOpen"
        :active-count="activeFilterCount"
        :counts="auditCounts"
        :eligible-count="eligibleAuditFixCount"
        @close="closeFilters"
        @reset="resetAuditFilters"
      />
      <!-- Zone principale -->
      <div class="psh-main">
        <UiFeedback v-if="feedback" :type="feedbackType" :message="feedback" class="vf-feedback" dismissible @dismiss="clearFeedback" />

        <!-- Onglet 1 : Alignement des pistes (Mode PASTA) -->
        <VfAuditPanel
          v-if="activeTab === 'audit'"
          :items="auditFilteredItems"
          :loading="auditLoading"
          :fixing-all="fixingAll"
          @align="openAlignModal"
          @refresh="loadAudit({ silent: true })"
        />

        <!-- Onglet 2 : Releases & Remplacements (*arr) -->
        <VfUpgradesPanel
          v-else-if="activeTab === 'upgrades'"
          :groups="groups"
          :loading="loading"
          :waiting-truncated="waitingTruncated"
          :selected-keys="selectedKeys"
          @toggle-select="toggleGroupSelection"
          @ignore="ignoreSeries"
          @dismiss="dismiss"
          @refresh="load({ silent: true })"
        />

        <!-- Onglet 3 : Historique des cycles de scan -->
        <template v-else-if="activeTab === 'history'">
          <VfScanHistory
            :live-scan="liveScan ?? undefined"
            :runs="scanRuns"
            :loading="scanRunsLoading"
            :expanded-run-id="expandedRunId ?? undefined"
            :items="runItems"
            :items-loading="runItemsLoading"
            :format-date="formatDate"
            :format-duration="formatDuration"
            :status-label="runStatusLabel"
            @toggle="toggleRunDetail"
          />
        </template>
      </div>
    </div>

    <!-- Modale interactive d'alignement des pistes Plex -->
    <AlignStreamsModal
      v-if="alignModalOpen"
      :open="alignModalOpen"
      :item="modalItem"
      @close="alignModalOpen = false"
      @applied="onStreamsAligned"
    />

  </AppPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RotateCcw, ScanSearch, Settings, SlidersHorizontal } from '@lucide/vue';
import { useRealtime } from '@/events';
import AppSubnav from '@/components/ui/AppSubnav.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiButton from '@/components/ui/UiButton.vue';
import AlignStreamsModal from '@/components/media/AlignStreamsModal.vue';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { useEventListener } from '@vueuse/core';
import VfUpgradeKpiBanner from '@/components/vf-upgrades/VfUpgradeKpiBanner.vue';
import VfScanHistory from '@/components/vf-upgrades/VfScanHistory.vue';
import VfAuditPanel from '@/components/vf-upgrades/VfAuditPanel.vue';
import VfAuditFilters from '@/components/vf-upgrades/VfAuditFilters.vue';
import VfUpgradeFilters from '@/components/vf-upgrades/VfUpgradeFilters.vue';
import VfUpgradesPanel from '@/components/vf-upgrades/VfUpgradesPanel.vue';
import { filterVfUpgradeItems, groupVfUpgradeItems } from '@/utils/vfUpgradeGroups';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { useFeedback } from '@/composables/useFeedback';
import { useToast } from '@/composables/useToast';
import { formatDateTimeShort } from '@/utils/format';
import { canFixStreams, formatRunDuration as formatDuration, runStatusLabel } from '@/utils/vfUpgradeLabels';
import type { VfUpgradeGroup } from '@/types/vfUpgrades';
import type { AuditItem, VfUpgradeEvent } from '@/composables/vf/types';
import { useVfAudit } from '@/composables/vf/useVfAudit';
import { useVfScanHistory } from '@/composables/vf/useVfScanHistory';
import { useVfSelection } from '@/composables/vf/useVfSelection';
import { useVfUpgrades } from '@/composables/vf/useVfUpgrades';
import { useRoute, useRouter } from 'vue-router';

type VfTab = 'upgrades' | 'audit' | 'history';
const activeTab = ref<VfTab>('upgrades'); // *arr | audit des pistes Plex | historique des scans
const { message: feedback, type: feedbackType, show, clear: clearFeedback } = useFeedback();
const { undoable } = useToast();

/* Un lien peut arriver deja filtre : « 1 échec(s) » sur la page Configuration renvoie
   ici avec `?status=failed`. Sans cette lecture, le lien menait a la liste complete et
   laissait l'administrateur retrouver l'echec a la main. */
// `useRoute()` ne renvoie rien quand la vue est montee hors routeur (tests unitaires) :
// le filtre retombe alors sur sa valeur par defaut.
const route = useRoute();
const router = useRouter();
const VALID_STATUS_FILTERS = ['pending', 'waiting_release', 'in_progress', 'failed', 'history', 'ignored', 'all'];
const initialStatus = String(route?.query?.status || '');
const statusFilter = ref<string>(VALID_STATUS_FILTERS.includes(initialStatus) ? initialStatus : 'pending');
const mediaTypeFilter = ref('');
const query = ref('');
const auditIssueFilter = ref('');
const auditMediaTypeFilter = ref('');

// Onglet « Releases & Telechargements » : suggestions, selection et scan groupe.
const upgrades = useVfUpgrades(show, undoable);
const {
  items, loading, waitingTruncated,
  pendingCount, waitingReleaseCount, inProgressCount, failedCount, historyCount, ignoredCount,
  load, dismiss, maintenance,
} = upgrades;
const selection = useVfSelection(show, () => load({ silent: true }));
const { selectedKeys, scanning, scanSelected, clear: clearSelection } = selection;
const toggleGroupSelection = (group: VfUpgradeGroup) => selection.toggle(group.key);
const ignoreSeries = (group: VfUpgradeGroup, ignored: boolean) => upgrades.ignoreMedia(group, ignored);

// Onglet « Alignement des pistes » : audit Plex et detail des series.
const audit = useVfAudit(show);
const {
  items: auditItems, counts: auditCounts, loading: auditLoading, fixingAll,
  totalCount: auditTotalCount, eligibleFixCount: eligibleAuditFixCount, load: loadAudit,
} = audit;

// Onglet « Historique des scans ».
const history = useVfScanHistory(show);
const {
  runs: scanRuns, loading: scanRunsLoading, liveScan, expandedRunId, runItems, runItemsLoading,
  loadRuns: loadScanRuns, toggleRun: toggleRunDetail,
} = history;

// Modale d'alignement unitaire
const alignModalOpen = ref(false);
const modalItem = ref<AuditItem | null>(null);

const tabs = computed(() => [
  { key: 'audit', label: 'Alignement des pistes (Plex)', count: eligibleAuditFixCount.value || auditTotalCount.value },
  { key: 'upgrades', label: 'Releases & Téléchargements (*arr)', count: pendingCount.value || waitingReleaseCount.value },
  { key: 'history', label: 'Historique des scans' },
]);

function selectTab(value: string): void {
  if (value !== 'upgrades' && value !== 'audit' && value !== 'history') return;
  activeTab.value = value;
  if (value !== 'upgrades') clearSelection();
  if (value === 'audit' && !auditItems.value.length) loadAudit();
  if (value === 'history') history.activate();
  else history.deactivate();
}

/* Les reglages s'ouvrent dans la feuille, a leur propre adresse (voir VfSettingsView).
   Un reglage enregistre change ce que les cycles retiennent (seuil de confiance,
   garde-fous techniques, portees) : on recharge la liste pour qu'elle reflete la
   nouvelle configuration plutot que l'ancienne. */
function openSettings(): void {
  ouvrirFiche(router, '/vf-upgrades/settings', route?.fullPath || '/vf-upgrades');
}
useEventListener(window, 'watchdeck:vf-settings-saved', () => { void load({ silent: true }); });

const { filtersOpen, toggle: toggleFilters, close: closeFilters } = useFiltersDrawer(
  { statusFilter, mediaTypeFilter },
  { statusFilter: 'pending', mediaTypeFilter: '' },
  { memoriser: 'ameliorations-vf' }
);
const upgradeDrawer = useFiltersDrawer(
  { statusFilter, mediaTypeFilter, query },
  { statusFilter: 'pending', mediaTypeFilter: '', query: '' }
);
const auditDrawer = useFiltersDrawer(
  { auditIssueFilter, auditMediaTypeFilter, query },
  { auditIssueFilter: '', auditMediaTypeFilter: '', query: '' },
  { memoriser: 'audit-vf', champsMemorises: ['auditIssueFilter', 'auditMediaTypeFilter'] }
);

const activeFilterCount = computed(() => {
  let count = 0;
  if (activeTab.value === 'upgrades') {
    if (statusFilter.value && statusFilter.value !== 'pending') count++;
    if (mediaTypeFilter.value) count++;
  } else {
    if (auditIssueFilter.value) count++;
    if (auditMediaTypeFilter.value) count++;
  }
  return count;
});

const filtered = computed(() => filterVfUpgradeItems(items.value, query.value, statusFilter.value, mediaTypeFilter.value));
const groups = computed(() => groupVfUpgradeItems(filtered.value));

const auditFilteredItems = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return auditItems.value.filter(item => {
    const matchesQuery = !needle || (item.title || '').toLowerCase().includes(needle);
    const matchesMedia = !auditMediaTypeFilter.value || item.media_type === auditMediaTypeFilter.value;
    let matchesIssue = true;
    if (auditIssueFilter.value === 'eligible') {
      matchesIssue = canFixStreams(item);
    } else if (auditIssueFilter.value) {
      matchesIssue = Boolean(item.issues?.includes(auditIssueFilter.value));
    }
    return matchesQuery && matchesMedia && matchesIssue;
  });
});

// « Tout aligner » ne touche que les medias affiches, filtres compris.
const fixAllStreams = () => audit.fixAll(auditFilteredItems.value);


function resetUpgradeFilters(): void {
  upgradeDrawer.reset();
}
function resetAuditFilters(): void {
  auditDrawer.reset();
}
function toggleAuditFilter(issue: string): void {
  auditIssueFilter.value = auditIssueFilter.value === issue ? '' : issue;
}
function toggleStatusFilter(status: string): void {
  statusFilter.value = statusFilter.value === status ? 'all' : status;
}

function openAlignModal(item: AuditItem): void {
  modalItem.value = item;
  alignModalOpen.value = true;
}
function onStreamsAligned({ item, res }: { item: AuditItem; res?: { users_count?: number; parts_processed?: number } }): void {
  const userMsg = (res?.users_count ?? 0) > 1 ? ` pour ${res?.users_count} profils Plex` : '';
  const partsMsg = (res?.parts_processed ?? 0) > 1 ? `${res?.parts_processed} parties` : 'le média';
  show(`Pistes réalignées avec succès sur Plex sur ${partsMsg}${userMsg}.`);
  audit.applyStreamsFixInPlace(item.id);
}

function formatDate(value?: string | null): string {
  return formatDateTimeShort(value, '—');
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

onMounted(() => {
  load();
  loadAudit();
});
</script>

<style scoped lang="scss">
.vf-upgrades-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.vf-feedback {
  margin-bottom: var(--space-3);
}

</style>
