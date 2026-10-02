<template>
  <AppPage hide-search
    title="Tableau de bord"
    :error="error"
    error-title="Actualisation partielle"
    retry
    :loading="loading && !updatedAt"
    loading-message="Chargement du tableau de bord…"
    @retry="load"
  >

    <OnboardingChecklist :onboarding="onboarding" :show="showOnboarding" @dismiss="dismissOnboarding" />

    <DashboardGreeting :name="userName" :attention-count="attentionCount" :syncing="syncingAll" @sync-all="syncAll" />

    <!-- Activite Plex en direct, sur toute la largeur, juste sous l'en-tete. -->
    <DashboardLiveStrip
      :sessions="liveActivity.active || []"
      :collection-enabled="liveActivity.enabled !== false"
      @select="openSession"
    />

    <DashboardActionCenter :pending="pending" :queue="downloadQueue" :failed-count="failedCount" @action="action"/>

    <AcquisitionPipelinePanel
      :pending-count="Number(counts.pending_approval ?? pending.length ?? 0)"
      :downloading-count="queueTotals.downloading"
      :import-pending-count="queueTotals.importPending"
      :available-count="counts.available ?? '…'"
      :blocked-count="queueTotals.blocked + failedCount"
    />

    <div class="dashboard-bento">
      <DashboardVfUpgradesPanel class="bento-wide" />
      <DownloadQueuePanel class="bento-narrow" :queue="downloadQueue" :loading="loadingQueue" />
    </div>

    <ActivityChartPanel :timeline="timeline" />

    <DashboardLibraryTabs :recently-available="recentlyAvailable" :recent-requests="recentRequests" :upcoming="upcoming" />

    <!-- Sante et stockage ne sont lus qu'une fois la zone a l'ecran (ou Supervision
         ouverte) : le bas de page ne doit pas retarder le premier affichage. -->
    <div ref="healthZone" class="dashboard-bento">
      <ServiceHealthPanel v-if="healthShown" class="bento-wide" />
      <div class="bento-narrow bento-stack">
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
        <DiskSpacePanel v-if="healthShown" :volumes="diskSpace" />
      </div>
    </div>

    <UiDisclosure
      title="Supervision"
      eyebrow="Historique"
      description="Exécutions du planificateur, répartition des demandes et derniers envois."
      storage-key="dashboard.supervisionOpen"
      content-class="dashboard-supervision"
      @open="loadSupervision"
    >
      <RecentJobsPanel :polls="polls" :next-poll="nextPoll" :countdown="countdown" />
      <RequestsBreakdownPanel :counts="counts"/>
      <TopRequestedPanel :items="topRequested"/>
      <RecentNotificationsPanel :notifications="recentNotifs"/>
    </UiDisclosure>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useElementVisibility } from '@vueuse/core';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useIntervalFn } from '@vueuse/core';
import UiDisclosure from '@/components/ui/UiDisclosure.vue';
import OnboardingChecklist from '@/components/dashboard/OnboardingChecklist.vue';
import DashboardActionCenter from '@/components/dashboard/DashboardActionCenter.vue';
import DashboardGreeting from '@/components/dashboard/DashboardGreeting.vue';
import DashboardLiveStrip from '@/components/dashboard/DashboardLiveStrip.vue';
import DashboardVfUpgradesPanel from '@/components/dashboard/DashboardVfUpgradesPanel.vue';
import DashboardLibraryTabs from '@/components/dashboard/DashboardLibraryTabs.vue';
import { attentionTotal } from '@/components/dashboard/dashboardAttention';
import AcquisitionPipelinePanel from '@/components/dashboard/AcquisitionPipelinePanel.vue';
import RecentJobsPanel from '@/components/dashboard/RecentJobsPanel.vue';
import RequestsBreakdownPanel from '@/components/dashboard/RequestsBreakdownPanel.vue';
import DownloadQueuePanel from '@/components/dashboard/DownloadQueuePanel.vue';
import ActivityChartPanel from '@/components/dashboard/ActivityChartPanel.vue';
import DiskSpacePanel from '@/components/dashboard/DiskSpacePanel.vue';
import TopRequestedPanel from '@/components/dashboard/TopRequestedPanel.vue';
import RecentNotificationsPanel from '@/components/dashboard/RecentNotificationsPanel.vue';
import ScanStatusPanel from '@/components/dashboard/ScanStatusPanel.vue';
import ServiceHealthPanel from '@/components/dashboard/ServiceHealthPanel.vue';
import { etatDeVoisins, ouvrirFiche } from '@/composables/useMediaOverlay';
import { useRoute, useRouter } from 'vue-router';
import { api, streamEvents } from '@/api';
import { readCacheEntry, writeCache } from '@/cache';
import { useRealtime } from '@/events';
import { queueCounts } from '@/downloads/queueRules';
import { usePreference } from '@/composables/usePreference';
import { useSession } from '@/composables/useSession';
import { queryKeys } from '@/queryKeys';
import { arrQueueQuery, diskSpaceQuery, playbackLiveQuery, vffCountsQuery, vffScanStatusQuery, vffSyncStatusQuery } from '@/sharedQueries';

const SNAPSHOT_CACHE_KEY = 'dashboard:snapshot';
const PRIMARY_SECTIONS = [
  // `counts` alimente la derniere etape du bandeau « Situation actuelle », tout en haut
  // de la page. Reserve au bloc « Supervision » -- replie par defaut et charge a la
  // demande -- l'etape « Disponibles » affichait un simple tiret a l'arrivee, a cote de
  // trois etapes chiffrees, sans que rien n'explique pourquoi. C'est une seule requete
  // d'agregation : elle appartient au premier chargement.
  'counts',
  'pending', 'polls', 'timeline', 'onboarding', 'recently_available',
  'recent_requests', 'upcoming', 'next_poll',
];
const SUPERVISION_SECTIONS = ['top_requested', 'by_user', 'notifications'];
// Au-dela, mieux vaut l'ecran de chargement qu'un etat qui n'a plus rien a voir.
const SNAPSHOT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const counts = ref<Record<string, any>>({});
const pending = ref<any[]>([]);
const polls = ref<any[]>([]);
const timeline = ref<{ labels: any[]; values: any[] }>({ labels: [], values: [] });
const byUser = ref<any[]>([]);
const onboarding = ref<Record<string, any>>({});
const nextPoll = ref<Record<string, any>>({});
const loading = ref(false);
const error = ref('');
const seconds = ref<number | null>(null);
const topRequested = ref<any[]>([]);
const recentlyAvailable = ref<any[]>([]);
const recentRequests = ref<any[]>([]);
const upcoming = ref<any[]>([]);
const recentNotifs = ref<any[]>([]);
const supervisionLoaded = ref(false);
const supervisionLoading = ref(false);
/* File Arr, lectures en cours, espace disque et statuts VFF : memes cles que les pages
   Telechargements, Activite et Reglages, donc un seul cache pour tous. Le snapshot, lui,
   arrive section par section par son flux (voir `load`). */
const queryClient = useQueryClient();
const downloadQueueQuery = useQuery({ ...arrQueueQuery(), select: (data: any) => (Array.isArray(data) ? data : []) });
const downloadQueue = computed<any[]>(() => downloadQueueQuery.data.value || []);
const liveActivityQuery = useQuery(playbackLiveQuery());
const liveActivity = computed<Record<string, any>>(() => liveActivityQuery.data.value || { active: [] });
/* Sante et espace disque : lus a l'arrivee de leur zone a l'ecran, ou a l'ouverture de
   Supervision (l'observateur n'existe pas partout, et un lecteur au clavier peut
   atteindre Supervision sans que la zone ait ete vue). Une fois montres, ils restent. */
const healthZone = ref<HTMLElement | null>(null);
const healthZoneVisible = useElementVisibility(healthZone);
const healthShown = ref(false);
watch([healthZoneVisible, supervisionLoaded], ([visible, opened]) => { if (visible || opened) healthShown.value = true; }, { immediate: true });
const diskSpaceQueryState = useQuery({ ...diskSpaceQuery(), enabled: healthShown });
const diskSpace = computed<any[]>(() => diskSpaceQueryState.data.value || []);
watch(diskSpaceQueryState.error, (e: any) => { if (e) error.value = e.message; });
const route = useRoute();
const router = useRouter();
/* La fiche d'une lecture s'ouvre dans la feuille, avec sa propre adresse. */
function openSession(item: any): void {
  if (item?.id == null) return;
  const ids = (liveActivity.value.active || []).map((row: any) => row.id).filter((id: any) => id != null);
  ouvrirFiche(router, `/activity/session/${item.id}`, route.fullPath, etatDeVoisins(ids));
}
/* Chargement seulement au premier affichage : les rafraichissements suivants gardent la
   liste a l'ecran et la mettent a jour sans la remplacer par « Chargement… ». */
const loadingQueue = computed(() => downloadQueueQuery.isPending.value);
const updatedAt = ref<number | null>(null);
const clock = ref(Date.now());
const vffScanQuery = useQuery(vffScanStatusQuery());
const plexSyncQuery = useQuery(vffSyncStatusQuery());
const vffCountsQueryState = useQuery(vffCountsQuery());
/* Statut illisible (`{}`) : l'etat de repos, comme avant la premiere reponse. */
const orIdle = (data: Record<string, any> | undefined, idle: Record<string, any>) => (data && Object.keys(data).length ? data : idle);
const vffScan = computed(() => orIdle(vffScanQuery.data.value, { status: 'idle', items_scanned: 0, total_items: 0, finished_at: null }));
const plexSync = computed(() => orIdle(plexSyncQuery.data.value, { status: 'idle', items_synced: 0, total_items: 0, finished_at: null }));
const arrSync = ref<Record<string, any>>({ status: 'idle', finished_at: null });
const watchlistSync = ref<Record<string, any>>({ status: 'idle', finished_at: null });
const vffCounts = computed<Record<string, any>>(() => vffCountsQueryState.data.value || {});

const onboardingHidden = usePreference('onboarding.hidden', false, { legacyKeys: ['hide_onboarding'] });
const showOnboarding = computed(() => !onboardingHidden.value);
function dismissOnboarding(): void {
  onboardingHidden.value = true;
}

// "En cours" = sent_to_arr + partially_available (affine cote page Bibliotheque pour
// exclure les series a jour sur tout ce qui est deja diffuse -- voir matchesStatusFilter
// dans LibraryView.vue). Ne passer que "sent_to_arr" ici excluait a tort les series
// comme Face Off/New York police judiciaire (statut partially_available, vrai manque).
const IN_PROGRESS_STATUSES = ['sent_to_arr', 'partially_available'];
const failedCount = computed(() => Number(counts.value.failed || 0));
// Memes regles que la page Telechargements (@/downloads/queueRules) : les trois tuiles
// ci-dessous partitionnent la file sans double compte, et chaque chiffre correspond au
// groupe qu'on trouve en cliquant.
const queueTotals = computed(() => queueCounts(downloadQueue.value));
const attentionCount = computed(() => attentionTotal(pending.value.length, downloadQueue.value, failedCount.value));

const { session } = useSession();
const userName = computed(() => String(session.value?.display_name || session.value?.username || '').trim());

const countdown = computed(() => seconds.value == null ? '-' : seconds.value < 60 ? `${seconds.value}s` : `${Math.floor(seconds.value / 60)} min`);

/* `cancelRefetch: false` : une lecture deja en vol (celle du montage) est reprise
   plutot qu'annulee puis relancee. */
function refresh(queryKey: readonly unknown[]): Promise<void> {
  return queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
}
const loadDownloadQueue = () => refresh(queryKeys.downloads.arrQueue);
const loadLiveActivity = () => refresh(queryKeys.playback.live);
const loadVffStatus = () => refresh(queryKeys.vff.all);

/**
 * Progression poussee par le backend (voir app/services/vff_progress.py). Le payload
 * porte l'etat complet : aucun aller-retour supplementaire n'est necessaire. Les
 * compteurs ne sont joints qu'en fin de scan, les conserver sinon.
 */
function applyVffEvent(detail: any): void {
  const payload = detail?.payload;
  if (!payload) return;
  if (payload.scan) queryClient.setQueryData(queryKeys.vff.scanStatus, payload.scan);
  if (payload.sync) queryClient.setQueryData(queryKeys.vff.syncStatus, payload.sync);
  if (payload.counts) queryClient.setQueryData(queryKeys.vff.counts, payload.counts);
}

async function triggerVffScan(): Promise<void> {
  try { await api('/api/vff/scan', { method: 'POST' }); await loadVffStatus(); } catch (e: any) { error.value = e.message; }
}

async function triggerPlexSync(): Promise<void> {
  try { await api('/api/vff/sync-plex', { method: 'POST' }); await loadVffStatus(); } catch (e: any) { error.value = e.message; }
}

async function triggerArrSync(): Promise<void> {
  arrSync.value = { status: 'running' };
  try {
    await api('/api/maintenance/run/check-arr-statuses', { method: 'POST' });
    arrSync.value = { status: 'idle', finished_at: new Date().toISOString() };
  } catch (e: any) {
    arrSync.value = { status: 'failed' };
    error.value = e.message;
  }
}

async function triggerWatchlistSync(): Promise<void> {
  watchlistSync.value = { status: 'running' };
  try {
    await api('/api/maintenance/run/discover-users', { method: 'POST' });
    watchlistSync.value = { status: 'idle', finished_at: new Date().toISOString() };
  } catch (e: any) {
    watchlistSync.value = { status: 'failed' };
    error.value = e.message;
  }
}

/* « Tout synchroniser » : Plex, statuts *arr et watchlists en parallele. Chaque synchro
   garde son propre etat dans « Etat des scans » ; le bouton attend la plus lente. */
const syncingAll = ref(false);
async function syncAll(): Promise<void> {
  if (syncingAll.value) return;
  syncingAll.value = true;
  try {
    await Promise.all([triggerPlexSync(), triggerArrSync(), triggerWatchlistSync()]);
  } finally {
    syncingAll.value = false;
  }
}

function applyDashboardSnapshot(snapshot: Record<string, any>, { savedAt = Date.now() }: { savedAt?: number } = {}): void {
  const assignments: Array<[string, { value: any }]> = [
    ['counts', counts], ['pending', pending], ['polls', polls],
    ['timeline', timeline], ['by_user', byUser], ['onboarding', onboarding],
    ['next_poll', nextPoll], ['top_requested', topRequested],
    ['recently_available', recentlyAvailable], ['recent_requests', recentRequests],
    ['upcoming', upcoming],
  ];
  assignments.forEach(([key, target]) => {
    if (snapshot[key] !== undefined) target.value = snapshot[key];
  });
  if (snapshot.notifications !== undefined) {
    recentNotifs.value = snapshot.notifications?.items ?? snapshot.notifications ?? [];
  }
  // Uniquement quand la section est presente : le flux envoie les sections une par une, et
  // reappliquer l'ancienne valeur a chaque trame ferait sauter le compte a rebours en
  // arriere, annulant les decrements de la seconde ecoulee.
  if (snapshot.next_poll !== undefined) {
    seconds.value = nextPoll.value?.next_run_seconds ?? null;
  }
  updatedAt.value = savedAt;
}

/**
 * Repeint immediatement le dernier snapshot connu, avant meme le premier aller-retour
 * reseau. `next_poll` est volontairement ecarte : le compte a rebours « prochaine
 * verification dans X » serait faux (il a continue de tourner cote serveur pendant que la
 * page n'etait pas montee) et repartirait a l'envers a l'arrivee de la vraie valeur.
 */
function primeFromCache(): void {
  const entry = readCacheEntry(SNAPSHOT_CACHE_KEY, { maxAgeMs: SNAPSHOT_CACHE_MAX_AGE_MS });
  if (!entry) return;
  applyDashboardSnapshot({ ...entry.data, next_poll: undefined }, { savedAt: entry.savedAt });
}

/**
 * Fusionne avec l'existant plutot que d'ecraser : `loadDashboardSections` ne renvoie que
 * les sections demandees, et un rafraichissement cible ne doit pas amputer le snapshot
 * mis en cache pour le prochain montage de la page.
 */
function cacheSnapshot(snapshot: Record<string, any>): void {
  const previous = readCacheEntry(SNAPSHOT_CACHE_KEY, { maxAgeMs: SNAPSHOT_CACHE_MAX_AGE_MS })?.data;
  const { errors, ...sections } = snapshot;
  writeCache(SNAPSHOT_CACHE_KEY, { ...(previous || {}), ...sections });
}

async function loadDashboardSections(sections: string[]): Promise<void> {
  const snapshot = await api(`/api/dashboard/snapshot?sections=${sections.join(',')}`);
  applyDashboardSnapshot(snapshot);
  cacheSnapshot(snapshot);
}

async function loadSupervision(): Promise<void> {
  if (supervisionLoading.value) return;
  supervisionLoaded.value = true;
  supervisionLoading.value = true;
  try {
    // L'espace disque suit `supervisionLoaded` (sa requete s'active avec lui).
    await loadDashboardSections(SUPERVISION_SECTIONS);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    supervisionLoading.value = false;
  }
}

let loadedOnce = false;
async function load(): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  const failures: string[] = [];
  const sections = supervisionLoaded.value
    ? [...PRIMARY_SECTIONS, ...SUPERVISION_SECTIONS]
    : PRIMARY_SECTIONS;
  // Chaque section s'affiche des qu'elle arrive, sans attendre la plus lente des dix.
  function applyChunk(chunk: Record<string, any>): void {
    if (chunk.errors?.length) {
      failures.push(...chunk.errors);
      return;
    }
    applyDashboardSnapshot(chunk);
    cacheSnapshot(chunk);
  }

  try {
    await streamEvents(
      `/api/dashboard/snapshot/stream?sections=${sections.join(',')}`,
      applyChunk,
    );
  } catch (streamError) {
    // Repli d'un bloc : proxy qui tamponne, navigateur sans ReadableStream, coupure
    // reseau en cours de flux. Les sections deja recues restent affichees.
    try {
      const snapshot = await api(`/api/dashboard/snapshot?sections=${sections.join(',')}`);
      applyDashboardSnapshot(snapshot);
      cacheSnapshot(snapshot);
      if (snapshot.errors?.length) failures.push(...snapshot.errors);
    } catch (e) {
      failures.push('snapshot du tableau de bord');
    }
  }
  // Les donnees externes completent la vue au fil de l'eau et ne retardent jamais le
  // premier affichage du snapshot local. Au premier chargement, leurs requetes viennent
  // d'etre lancees par le montage : inutile de les relire.
  if (loadedOnce) {
    loadDownloadQueue().catch(() => {});
    loadLiveActivity().catch(() => {});
    loadVffStatus().catch(() => {});
  }
  loadedOnce = true;
  updatedAt.value = Date.now();
  error.value = failures.length ? `Données indisponibles : ${failures.join(', ')}.` : '';
  loading.value = false;
}

async function action(row: any, type: string): Promise<void> {
  try {
    if (type === 'reject') {
      const reason = prompt('Motif du refus', 'Demande refusée');
      if (reason === null) return;
      await api(`/api/requests/${row.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
    } else {
      await api(`/api/requests/${row.id}/approve`, { method: 'POST' });
    }
    await load();
  } catch (e: any) { error.value = e.message; }
}

import { patchedList } from '@/composables/useRealtimeQuery';

/** Reporte un evenement sur une liste locale en la REMPLACANT, sans muter ses elements. */
function patchItem(list: { value: any[] }, detail: any, options: { keyFields: string[] }): boolean {
  const { list: next, patched } = patchedList(list.value, detail, options);
  if (patched) list.value = next;
  return patched;
}

useRealtime(['request.updated'], (type, detail) => {
  if (detail && (detail.request_id || detail.id)) {
    const p1 = patchItem(pending, detail, { keyFields: ['request_id', 'id'] });
    const p2 = patchItem(recentlyAvailable, detail, { keyFields: ['request_id', 'id'] });
    const p3 = patchItem(recentRequests, detail, { keyFields: ['request_id', 'id'] });
    if (p1 || p2 || p3) return;
  }
  if (!type) return load();
  return loadDashboardSections([
    // `counts` est desormais une section primaire : le bandeau du haut en depend, il se
    // rafraichit donc a chaque evenement, que « Supervision » soit ouvert ou non.
    'counts',
    'pending', 'timeline', 'recently_available', 'recent_requests', 'upcoming', 'next_poll',
    ...(supervisionLoaded.value ? ['by_user', 'top_requested'] : []),
  ]).catch(() => {});
});
useRealtime(['download.updated'], (type) => type ? loadDownloadQueue().catch(() => {}) : load());
useRealtime(['notification.updated'], (type) => type
  ? supervisionLoaded.value && loadDashboardSections(['notifications']).catch(() => {})
  : load());
useRealtime(['activity.updated'], () => loadLiveActivity().catch(() => {}));
// Remplace un sondage a 5 s (3 appels HTTP, soit 36 requetes/minute en permanence, meme
// au repos). `type` absent = retour sur l'onglet apres une possible perte du flux SSE :
// on resynchronise alors par un appel unique.
useRealtime(['vff.updated'], (type, detail) => {
  if (!type) return loadVffStatus().catch(() => {});
  applyVffEvent(detail);
});

// Compte a rebours et horloge : locaux, ils doivent avancer meme onglet masque pour que
// « prochaine verification dans X » soit juste au retour sur l'onglet. Les donnees, elles,
// arrivent par le flux du snapshot et les evenements SSE : aucun sondage reseau ici.
useIntervalFn(() => {
  if (seconds.value != null && seconds.value > 0) seconds.value--;
  clock.value = Date.now();
}, 1000);

onMounted(async () => {
  primeFromCache();
  await load();
});
</script>

<style scoped lang="scss">
/* Grille de l'accueil : une colonne large (7/12) et une etroite (5/12), qui passent
   l'une sous l'autre quand le contenu se resserre. Les deux colonnes d'une rangee
   prennent la meme hauteur : un panneau peu rempli s'etire jusqu'au bas de son voisin
   plutot que de laisser un trou sous lui, et son message « vide » se centre dans la
   place disponible. Dans la pile de droite, le dernier panneau absorbe l'ecart. */
.dashboard-bento { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-4); align-items: stretch; min-width: 0; }
.dashboard-bento > .bento-wide { grid-column: span 7; min-width: 0; }
.dashboard-bento > .bento-narrow { grid-column: span 5; min-width: 0; }
.dashboard-bento > .bento-stack { display: flex; flex-direction: column; grid-column: 8 / -1; gap: var(--space-4); }
.dashboard-bento > .bento-stack > :last-child { flex: 1; }
.dashboard-bento :deep(.panel-card) { display: flex; flex-direction: column; }
.dashboard-bento :deep(.panel-card > .ui-empty-state) { flex: 1; align-content: center; }
:deep(.dashboard-supervision) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: start; }

@container page (max-width: 957px) {
  .dashboard-bento > .bento-wide,
  .dashboard-bento > .bento-narrow,
  .dashboard-bento > .bento-stack { grid-column: 1 / -1; }
  :deep(.dashboard-supervision) { grid-template-columns: minmax(0, 1fr); }
}
</style>
