import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import type { LiveScan, Notify, ScanRun, ScanRunItem } from './types';

const POLL_MS = 3000;
const RUNS_KEY = ['vf-upgrades', 'scan-runs'] as const;
const LIVE_SCAN_KEY = ['vf-upgrades', 'scan-status'] as const;
const runItemsKey = (runId: number | null) => ['vf-upgrades', 'scan-runs', runId, 'items'] as const;

interface RunItemsResponse { items?: ScanRunItem[]; run?: ScanRun }

/**
 * Historique des cycles de scan, et suivi en direct du cycle en cours.
 *
 * Deux sondages (`refetchInterval`), actifs seulement quand ils servent : l'etat du
 * cycle en cours tant que l'onglet est affiche, et le detail d'un cycle deplie tant
 * qu'il tourne. Ils s'arretent quand l'onglet est quitte, et avec le composant.
 */
export function useVfScanHistory(notify: Notify) {
  const queryClient = useQueryClient();
  const active = ref(false);
  const expandedRunId = ref<number | null>(null);

  const runsQuery = useQuery({
    queryKey: RUNS_KEY,
    queryFn: ({ signal }) => api<{ runs?: ScanRun[] }>('/api/vf-upgrades/scan-runs?limit=20', { signal }),
    enabled: active,
  });
  watch(runsQuery.error, (e) => { if (e) notify(humanizeError(e), 'error'); });
  const runs = computed<ScanRun[]>(() => runsQuery.data.value?.runs || []);
  const loading = computed(() => runsQuery.isFetching.value);

  // Silencieux : un echec ponctuel ne doit pas interrompre l'affichage.
  const liveScanQuery = useQuery({
    queryKey: LIVE_SCAN_KEY,
    queryFn: ({ signal }) => api<LiveScan>('/api/vf-upgrades/scan-status', { signal }),
    enabled: active,
    refetchInterval: POLL_MS,
    retry: 0,
  });
  const liveScan = computed<LiveScan | null>(() => liveScanQuery.data.value ?? null);
  // Le cycle vient de se terminer : rafraichit la liste pour faire apparaitre sa ligne.
  watch(() => liveScan.value?.status, (status, previous) => {
    if (previous === 'running' && status !== 'running') void loadRuns();
  });

  function runItemsOptions(runId: number) {
    return {
      queryKey: runItemsKey(runId),
      queryFn: ({ signal }: { signal: AbortSignal }) => api<RunItemsResponse>(`/api/vf-upgrades/scan-runs/${runId}/items`, { signal }),
      retry: 0,
    };
  }
  const runItemsQuery = useQuery({
    queryKey: computed(() => runItemsKey(expandedRunId.value)),
    queryFn: ({ signal }) => api<RunItemsResponse>(`/api/vf-upgrades/scan-runs/${expandedRunId.value}/items`, { signal }),
    enabled: computed(() => expandedRunId.value != null),
    // Le detail d'un cycle en cours se relit jusqu'a sa fin.
    refetchInterval: (query) => (query.state.data?.run?.status === 'running' ? POLL_MS : false),
    retry: 0,
  });
  const runItems = computed<ScanRunItem[]>(() => (expandedRunId.value == null ? [] : runItemsQuery.data.value?.items || []));
  const runItemsLoading = computed(() => runItemsQuery.isPending.value && runItemsQuery.isFetching.value);
  // Le cycle deplie vient de se terminer : sa ligne de l'historique change aussi.
  watch(() => runItemsQuery.data.value?.run?.status, (status, previous) => {
    if (previous === 'running' && status && status !== 'running') void loadRuns();
  });

  async function loadRuns(): Promise<void> {
    await runsQuery.refetch();
  }

  async function toggleRun(run: ScanRun): Promise<void> {
    if (expandedRunId.value === run.id) {
      expandedRunId.value = null;
      return;
    }
    expandedRunId.value = run.id;
    try {
      await queryClient.ensureQueryData(runItemsOptions(run.id));
    } catch (e) {
      notify(humanizeError(e), 'error');
    }
  }

  /** Onglet ouvert : charge l'historique et suit le cycle en cours. */
  function activate(): void {
    active.value = true;
  }

  /** Onglet quitte : plus aucun sondage, detail replie. */
  function deactivate(): void {
    active.value = false;
    expandedRunId.value = null;
  }

  return { runs, loading, liveScan, expandedRunId, runItems, runItemsLoading, loadRuns, toggleRun, activate, deactivate };
}
