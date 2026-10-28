import { formatCountdown } from '@/utils/format';
import { useToast } from '@/composables/useToast';
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { useElementVisibility } from '@vueuse/core';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useIntervalFn } from '@vueuse/core';
import { Download, Library, Tv } from '@lucide/vue';
import { dashboardAttentionItems } from '@/components/dashboard/dashboardAttention';
import { etatDeVoisins, ouvrirFiche } from '@/composables/useMediaOverlay';
import { useRoute, useRouter } from 'vue-router';
import { api, streamEvents } from '@/api';
import { readCacheEntry, writeCache } from '@/cache';
import { useRealtime } from '@/events';
import { queueCounts } from '@/downloads/queueRules';
import { usePreference } from '@/composables/usePreference';
import { queryKeys } from '@/queryKeys';
import { arrQueueQuery, diskSpaceQuery, playbackLiveQuery, vffCountsQuery, vffScanStatusQuery, vffSyncStatusQuery } from '@/sharedQueries';
import type { MonitorKpi, MonitorLabels, MonitorZoneGroup } from '@/components/templates/MonitorTemplate.vue';

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
const SUPERVISION_SECTIONS = ['top_requested', 'by_user'];
// Au-dela, mieux vaut l'ecran de chargement qu'un etat qui n'a plus rien a voir.
const SNAPSHOT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/* Tout ce que sait le tableau de bord : le snapshot par flux (avec son cache), les requetes
   partagees, les evenements temps reel et les actions de synchronisation. La page assemble. */
export function useDashboard(healthZone: Ref<HTMLElement | null>) {
  const counts = ref<Record<string, any>>({});
  const pending = ref<any[]>([]);
  const polls = ref<any[]>([]);
  const timeline = ref<{ labels: any[]; values: any[] }>({ labels: [], values: [] });
  const byUser = ref<any[]>([]);
  const onboarding = ref<Record<string, any>>({});
  const nextPoll = ref<Record<string, any>>({});
  const loading = ref(false);
  const error = ref('');
  /* Une source en echec n'efface pas la page : elle se signale, avec de quoi reessayer. */
  const toast = useToast();
  watch(error, (message) => {
    if (message) toast.addToast({ type: 'error', title: 'Actualisation partielle', message, action: { label: 'Réessayer', run: () => load(true) } });
  });
  const seconds = ref<number | null>(null);
  const topRequested = ref<any[]>([]);
  const recentlyAvailable = ref<any[]>([]);
  const recentRequests = ref<any[]>([]);
  const upcoming = ref<any[]>([]);
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
    queryClient.setQueryData(['playback', 'session', String(item.id)], (old: any) => old ?? {
      ...item,
      media: item.media || {
        poster_url: item.thumb_url,
        summary: item.summary,
      },
    });
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
  const scheduledTasksQuery = useQuery({
    queryKey: ['settings', 'scheduled-tasks'],
    queryFn: async () => { const data = await api<any[]>('/api/scheduled-tasks'); return Array.isArray(data) ? data : []; },
    enabled: healthShown,
  });
  const taskState = (job: string) => {
    const task = scheduledTasksQuery.data.value?.find((row: any) => row.job === job);
    return task ? { ...task.state, work: task.work } : { status: 'unknown' };
  };
  const arrSync = computed(() => taskState('arr-statuses'));
  const watchlistSync = computed(() => taskState('watchlist'));
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
  const failedCount = computed(() => Number(counts.value.failed || 0));
  // Memes regles que la page Telechargements (@/downloads/queueRules) : les trois tuiles
  // ci-dessous partitionnent la file sans double compte, et chaque chiffre correspond au
  // groupe qu'on trouve en cliquant.
  const queueTotals = computed(() => queueCounts(downloadQueue.value));
  const attentionItems = computed(() => dashboardAttentionItems(downloadQueue.value, failedCount.value));

  const AREA_ICONS: Record<string, any> = { downloads: markRaw(Download), library: markRaw(Library) };
  const labels: MonitorLabels = {
    okTitle: 'Aucune intervention nécessaire',
    okDetail: 'Imports bloqués et acquisitions en échec s’affichent ici.',
    attentionTitle: 'Points d’attention',
    kpisLabel: 'Vue d’ensemble de la bibliothèque',
    zonesLabel: 'Aller à',
  };

  /* Les trois chiffres de la file : ils partitionnent la file sans double compte, et chacun
     mene au groupe qu'il compte. */
  const kpis = computed<MonitorKpi[]>(() => {
    const waiting = loadingQueue.value;
    return [
      { key: 'downloading', label: 'En téléchargement', value: waiting ? '…' : String(queueTotals.value.downloading), status: 'Acquisitions actives', tone: 'info', to: '/downloads?view=queue&sub=active' },
      { key: 'import', label: 'À importer', value: waiting ? '…' : String(queueTotals.value.importPending), status: 'Téléchargements terminés', tone: queueTotals.value.importPending ? 'warn' : 'ok', to: '/downloads?view=queue&sub=intervention' },
      { key: 'available', label: 'Disponibles', value: String(counts.value.available ?? '—'), status: 'Dans votre bibliothèque', tone: 'ok', to: '/library?status=available' },
      { key: 'requests', label: 'Demandes', value: String(counts.value.pending_approval ?? pending.value.length ?? 0), status: Number(counts.value.pending_approval ?? pending.value.length ?? 0) ? 'À valider' : 'Rien à valider', tone: Number(counts.value.pending_approval ?? pending.value.length ?? 0) ? 'warn' : 'ok', to: '/library?status=pending_approval' },
    ];
  });

  /* Ou aller ensuite, avec l'etat de chaque partie en une ligne. */
  const zones = computed<MonitorZoneGroup[]>(() => {
    const playing = (liveActivity.value.active || []).length;
    const blocked = queueTotals.value.blocked;
    return [{
      label: 'Aller à',
      items: [
        { key: 'downloads', label: 'Acquisition', to: '/downloads', icon: markRaw(Download), line: blocked ? `${blocked} bloqué${blocked > 1 ? 's' : ''}` : `${queueTotals.value.downloading} en cours`, severity: blocked ? 'warn' : null },
        { key: 'library', label: 'Bibliothèque', to: '/library', icon: markRaw(Library), line: `${counts.value.available ?? '—'} disponibles`, severity: failedCount.value ? 'error' : null },
        { key: 'activity', label: 'Activité', to: '/activity', icon: markRaw(Tv), line: playing ? `${playing} lecture${playing > 1 ? 's' : ''} en cours` : 'Aucune lecture', severity: null },
      ],
    }];
  });

  const countdown = computed(() => formatCountdown(seconds.value));

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
    if (payload.scan?.work) queryClient.setQueryData(queryKeys.vff.scanStatus, payload.scan);
    else if (payload.scan) void refresh(queryKeys.vff.scanStatus);
    if (payload.sync?.work) queryClient.setQueryData(queryKeys.vff.syncStatus, payload.sync);
    else if (payload.sync) void refresh(queryKeys.vff.syncStatus);
    if (payload.counts) queryClient.setQueryData(queryKeys.vff.counts, payload.counts);
  }

  async function triggerVffScan(): Promise<void> {
    try { await api('/api/vff/scan', { method: 'POST' }); await loadVffStatus(); } catch (e: any) { error.value = e.message; }
  }

  async function triggerPlexSync(): Promise<void> {
    try { await api('/api/vff/sync-plex', { method: 'POST' }); await loadVffStatus(); } catch (e: any) { error.value = e.message; }
  }

  async function triggerTask(job: string): Promise<void> {
    try {
      await api(`/api/scheduled-tasks/${job}/run`, { method: 'POST' });
      await refresh(['settings', 'scheduled-tasks']);
    } catch (e: any) { error.value = e.message; }
  }
  const triggerArrSync = () => triggerTask('arr-statuses');
  const triggerWatchlistSync = () => triggerTask('watchlist');
  useRealtime(['job.updated'], () => { void refresh(['settings', 'scheduled-tasks']); });

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

  async function loadDashboardSections(sections: string[], fresh = false): Promise<void> {
    const snapshot = await api(`/api/dashboard/snapshot?sections=${sections.join(',')}${fresh ? '&refresh=true' : ''}`);
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
  let loadController: AbortController | undefined;
  let disposed = false;
  let loadTimeout: ReturnType<typeof setTimeout> | undefined;
  onBeforeUnmount(() => {
    disposed = true;
    loadController?.abort();
    if (loadTimeout) clearTimeout(loadTimeout);
  });
  async function load(fresh = false): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    error.value = '';
    const controller = new AbortController();
    loadController = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    loadTimeout = timeout;
    const failures: string[] = [];
    const sections = supervisionLoaded.value
      ? [...PRIMARY_SECTIONS, ...SUPERVISION_SECTIONS]
      : PRIMARY_SECTIONS;
    const receivedSections: Record<string, any> = {};
    // Chaque section s'affiche des qu'elle arrive, sans attendre la plus lente des dix.
    function applyChunk(chunk: Record<string, any>): void {
      if (chunk.errors?.length) {
        failures.push(...chunk.errors);
        return;
      }
      applyDashboardSnapshot(chunk);
      Object.assign(receivedSections, chunk);
    }

    try {
      await streamEvents(
        `/api/dashboard/snapshot/stream?sections=${sections.join(',')}${fresh ? '&refresh=true' : ''}`,
        applyChunk,
        { signal: controller.signal },
      );
    } catch (streamError) {
      if (disposed || controller.signal.aborted) {
        clearTimeout(timeout);
        loading.value = false;
        if (!disposed) error.value = 'Le chargement prend trop de temps. Réessayez.';
        return;
      }
      // Repli d'un bloc : proxy qui tamponne, navigateur sans ReadableStream, coupure
      // reseau en cours de flux. Les sections deja recues restent affichees.
      try {
        const snapshot = await api(`/api/dashboard/snapshot?sections=${sections.join(',')}${fresh ? '&refresh=true' : ''}`, { signal: controller.signal });
        applyDashboardSnapshot(snapshot);
        Object.assign(receivedSections, snapshot);
        if (snapshot.errors?.length) failures.push(...snapshot.errors);
      } catch (e) {
        failures.push('snapshot du tableau de bord');
      }
    }
    clearTimeout(timeout);
    loadController = undefined;
    if (disposed) return;
    // Les donnees externes completent la vue au fil de l'eau et ne retardent jamais le
    // premier affichage du snapshot local. Au premier chargement, leurs requetes viennent
    // d'etre lancees par le montage : inutile de les relire.
    if (Object.keys(receivedSections).length) cacheSnapshot(receivedSections);
    if (loadedOnce && fresh) {
      loadDownloadQueue().catch(() => {});
      loadLiveActivity().catch(() => {});
      loadVffStatus().catch(() => {});
    }
    loadedOnce = true;
    updatedAt.value = Date.now();
    error.value = failures.length ? `Données indisponibles : ${failures.join(', ')}.` : '';
    loading.value = false;
  }


  /** Reporte un evenement sur une liste locale en la REMPLACANT, sans muter ses elements. */
  useRealtime(['request.updated'], (type) => {
    if (!type) return load();
    return loadDashboardSections([
      // `counts` est desormais une section primaire : le bandeau du haut en depend, il se
      // rafraichit donc a chaque evenement, que « Supervision » soit ouvert ou non.
      'counts',
      'pending', 'timeline', 'recently_available', 'recent_requests', 'upcoming', 'next_poll',
      ...(supervisionLoaded.value ? ['by_user', 'top_requested'] : []),
    ], true).catch(() => {});
  });
  useRealtime(['download.updated'], () => loadDownloadQueue().catch(() => {}), { refreshOnVisible: false });
  useRealtime(['activity.updated'], () => loadLiveActivity().catch(() => {}), { refreshOnVisible: false });
  // Les événements appliquent directement les statuts ; TanStack Query assure déjà
  // la resynchronisation au retour sur l'onglet.
  useRealtime(['vff.updated'], (type, detail) => {
    if (!type) return loadVffStatus().catch(() => {});
    applyVffEvent(detail);
  }, { refreshOnVisible: false });

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

  return { counts, pending, polls, timeline, onboarding, nextPoll, loading, topRequested, recentlyAvailable, recentRequests, upcoming, downloadQueue, liveActivityQuery, liveActivity, healthShown, diskSpace, openSession, loadingQueue, updatedAt, vffScan, plexSync, arrSync, watchlistSync, vffCounts, showOnboarding, dismissOnboarding, failedCount, queueTotals, attentionItems, AREA_ICONS, labels, kpis, zones, countdown, triggerVffScan, triggerPlexSync, triggerArrSync, triggerWatchlistSync, syncingAll, syncAll, loadSupervision };
}
