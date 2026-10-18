<template>
  <!-- Accueil (gabarit Surveiller) : « est-ce que tout va bien ? ». Le verdict ne parle que
       s'il y a quelque chose a traiter ; l'activite Plex en direct, les trois chiffres de la
       file, les points d'attention et l'etat des services viennent ensuite, puis la lecture
       complementaire (file, derniers elements, graphique, supervision). Pas de recherche ;
       le chargement initial est un etat de page, une actualisation partielle (une source en
       echec) une notification qui propose de reessayer. -->
  <PageTemplate
    title="Accueil"
    page-class="dashboard-home"
    :state="loading && !updatedAt ? 'loading' : 'ready'"
    skeleton="cards"
    loading-message="Chargement du tableau de bord…"
  >
    <template #tools>
      <UiButton size="sm" :loading="syncingAll" @click="syncAll"><template #icon><RefreshCw /></template>Tout synchroniser</UiButton>
    </template>
    <template #quick-action>
      <UiButton variant="primary" to="/discover"><template #icon><Plus /></template>Nouvelle demande</UiButton>
    </template>

    <MonitorTemplate board :items="attentionItems" :kpis="kpis" :zones="zones" :icons="AREA_ICONS" :loading="false" :labels="labels">
      <!-- Activite Plex en direct, sur toute la largeur, juste sous le verdict. -->
      <template #live>
        <DashboardLiveStrip
          :sessions="liveActivity.active || []"
          :loading="liveActivityQuery.isPending.value"
          :failed="liveActivityQuery.isError.value"
          :collection-enabled="liveActivity.enabled !== false"
          @select="openSession"
        />
      </template>

      <!-- Sante et stockage ne sont lus qu'une fois la zone a l'ecran (ou Supervision
           ouverte) : le bas de page ne doit pas retarder le premier affichage. -->
      <template #details>
        <OnboardingChecklist :onboarding="onboarding" :show="showOnboarding" @dismiss="dismissOnboarding" />
        <div ref="healthZone" class="dashboard-details">
          <ServiceHealthPanel v-if="healthShown" />
          <DiskSpacePanel v-if="healthShown" :volumes="diskSpace" />
          <DashboardFileflowsPanel />
          <ScanStatusPanel
            :vff-scan="vffScan"
            :plex-sync="plexSync"
            :arr-sync="arrSync"
            :watchlist-sync="watchlistSync"
            :vff-counts="vffCounts"
            @scan-vff="triggerVffScan"
            @sync-plex="triggerPlexSync"
            @sync-arr="triggerArrSync"
            @sync-watchlist="triggerWatchlistSync"
          />
        </div>
      </template>

      <template #after>
        <AcquisitionPipelinePanel
          :pending-count="Number(counts.pending_approval ?? pending.length ?? 0)"
          :downloading-count="queueTotals.downloading"
          :import-pending-count="queueTotals.importPending"
          :available-count="counts.available ?? '…'"
          :blocked-count="queueTotals.blocked + failedCount"
        />

        <DownloadQueuePanel class="dashboard-downloads" :queue="downloadQueue" :loading="loadingQueue" />

        <DashboardLibraryTabs :recently-available="recentlyAvailable" :recent-requests="recentRequests" :upcoming="upcoming" />

        <div class="dashboard-bento">
          <DashboardVfUpgradesPanel class="bento-narrow" />
          <ActivityChartPanel class="bento-wide" :timeline="timeline" />
        </div>

        <UiDisclosure
          title="Supervision"
          eyebrow="Historique"
          description="Exécutions du planificateur et répartition des demandes."
          storage-key="dashboard.supervisionOpen"
          content-class="dashboard-supervision"
          @open="loadSupervision"
        >
          <RecentJobsPanel :polls="polls" :next-poll="nextPoll" :countdown="countdown" />
          <RequestsBreakdownPanel :counts="counts"/>
          <TopRequestedPanel class="supervision-wide" :items="topRequested"/>
        </UiDisclosure>
      </template>
    </MonitorTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Plus, RefreshCw } from '@lucide/vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import MonitorTemplate from '@/components/templates/MonitorTemplate.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDisclosure from '@/components/ui/UiDisclosure.vue';
import OnboardingChecklist from '@/components/dashboard/OnboardingChecklist.vue';
import DashboardLiveStrip from '@/components/dashboard/DashboardLiveStrip.vue';
import DashboardVfUpgradesPanel from '@/components/dashboard/DashboardVfUpgradesPanel.vue';
import DashboardFileflowsPanel from '@/components/dashboard/DashboardFileflowsPanel.vue';
import DashboardLibraryTabs from '@/components/dashboard/DashboardLibraryTabs.vue';
import AcquisitionPipelinePanel from '@/components/dashboard/AcquisitionPipelinePanel.vue';
import RecentJobsPanel from '@/components/dashboard/RecentJobsPanel.vue';
import RequestsBreakdownPanel from '@/components/dashboard/RequestsBreakdownPanel.vue';
import DownloadQueuePanel from '@/components/dashboard/DownloadQueuePanel.vue';
import ActivityChartPanel from '@/components/dashboard/ActivityChartPanel.vue';
import DiskSpacePanel from '@/components/dashboard/DiskSpacePanel.vue';
import TopRequestedPanel from '@/components/dashboard/TopRequestedPanel.vue';
import ScanStatusPanel from '@/components/dashboard/ScanStatusPanel.vue';
import ServiceHealthPanel from '@/components/dashboard/ServiceHealthPanel.vue';
import { useDashboard } from '@/composables/useDashboard';

/* La zone dont l'arrivee a l'ecran declenche la lecture de la sante des services. */
const healthZone = ref<HTMLElement | null>(null);
const {
  counts,
  pending,
  polls,
  timeline,
  onboarding,
  nextPoll,
  loading,
  topRequested,
  recentlyAvailable,
  recentRequests,
  upcoming,
  downloadQueue,
  liveActivityQuery,
  liveActivity,
  healthShown,
  diskSpace,
  openSession,
  loadingQueue,
  updatedAt,
  vffScan,
  plexSync,
  arrSync,
  watchlistSync,
  vffCounts,
  showOnboarding,
  dismissOnboarding,
  failedCount,
  queueTotals,
  attentionItems,
  AREA_ICONS,
  labels,
  kpis,
  zones,
  countdown,
  triggerVffScan,
  triggerPlexSync,
  triggerArrSync,
  triggerWatchlistSync,
  syncingAll,
  syncAll,
  loadSupervision,
} = useDashboard(healthZone);
</script>

<style scoped lang="scss">
.dashboard-home { gap: var(--space-5); }
.dashboard-downloads { width: 100%; }
@container page (min-width: 958px) {
  .dashboard-downloads :deep(.queue-main) { grid-template-columns: minmax(180px, 1fr) minmax(160px, 1fr); align-items: center; gap: var(--space-2) var(--space-5); }
  .dashboard-downloads :deep(.queue-heading) { grid-row: span 2; }
  .dashboard-downloads :deep(.queue-meta) { white-space: normal; }
}
.dashboard-home :deep(.pipeline-wrapper) { margin-bottom: 0; }

/* Les panneaux de sante s'empilent a cote des points d'attention. */
.dashboard-details { display: grid; gap: var(--space-4); min-width: 0; }

/* Vers le bas de la page : une colonne large (7/12) et une etroite (5/12), qui passent
   l'une sous l'autre quand le contenu se resserre. Les deux colonnes d'une rangee
   prennent la meme hauteur. */
.dashboard-bento { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-4); align-items: stretch; min-width: 0; }
.dashboard-bento > .bento-wide { grid-column: span 7; min-width: 0; }
.dashboard-bento > .bento-narrow { grid-column: span 5; min-width: 0; }
.dashboard-bento :deep(.panel-card) { display: flex; flex-direction: column; }
.dashboard-bento :deep(.panel-card > .ui-empty-state) { flex: 1; align-content: center; }
:deep(.dashboard-supervision) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: start; }
:deep(.dashboard-supervision > .supervision-wide) { grid-column: 1 / -1; }

@container page (max-width: 957px) {
  .dashboard-bento > .bento-wide,
  .dashboard-bento > .bento-narrow { grid-column: 1 / -1; }
  :deep(.dashboard-supervision) { grid-template-columns: minmax(0, 1fr); }
}
</style>
