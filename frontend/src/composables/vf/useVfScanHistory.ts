import { onScopeDispose, ref } from 'vue';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import type { LiveScan, Notify, ScanRun, ScanRunItem } from './types';

const POLL_MS = 3000;

/**
 * Historique des cycles de scan, et suivi en direct du cycle en cours.
 *
 * Deux sondages, actifs seulement quand ils servent : l'etat du cycle en cours tant
 * que l'onglet est affiche, et le detail d'un cycle deplie tant qu'il tourne. Tous
 * deux s'arretent au demontage.
 */
export function useVfScanHistory(notify: Notify) {
  const runs = ref<ScanRun[]>([]);
  const loading = ref(false);
  const liveScan = ref<LiveScan | null>(null);
  const expandedRunId = ref<number | null>(null);
  const runItems = ref<ScanRunItem[]>([]);
  const runItemsLoading = ref(false);
  let livePollTimer: ReturnType<typeof setInterval> | null = null;
  let itemsPollTimer: ReturnType<typeof setInterval> | null = null;

  async function loadRuns(): Promise<void> {
    loading.value = true;
    try {
      const data = await api<{ runs?: ScanRun[] }>('/api/vf-upgrades/scan-runs?limit=20');
      runs.value = data.runs || [];
    } catch (e) {
      notify(humanizeError(e), 'error');
    } finally {
      loading.value = false;
    }
  }

  async function loadRunItems(runId: number, { silent = false }: { silent?: boolean } = {}): Promise<ScanRun | null> {
    if (!silent) runItemsLoading.value = true;
    try {
      const data = await api<{ items?: ScanRunItem[]; run?: ScanRun }>(`/api/vf-upgrades/scan-runs/${runId}/items`);
      runItems.value = data.items || [];
      return data.run || null;
    } catch (e) {
      if (!silent) notify(humanizeError(e), 'error');
      return null;
    } finally {
      runItemsLoading.value = false;
    }
  }

  function stopItemsPolling(): void {
    if (itemsPollTimer) clearInterval(itemsPollTimer);
    itemsPollTimer = null;
  }

  async function toggleRun(run: ScanRun): Promise<void> {
    stopItemsPolling();
    if (expandedRunId.value === run.id) {
      expandedRunId.value = null;
      runItems.value = [];
      return;
    }
    expandedRunId.value = run.id;
    runItems.value = [];
    await loadRunItems(run.id);
    if (run.status === 'running') {
      itemsPollTimer = setInterval(async () => {
        const state = await loadRunItems(run.id, { silent: true });
        if (state && state.status !== 'running') {
          stopItemsPolling();
          await loadRuns();
        }
      }, POLL_MS);
    }
  }

  async function pollLiveScan(): Promise<void> {
    try {
      liveScan.value = await api<LiveScan>('/api/vf-upgrades/scan-status');
      // Le cycle vient de se terminer : rafraichit la liste pour faire apparaitre sa ligne.
      if (liveScan.value?.status !== 'running') await loadRuns();
    } catch {
      // Silencieux : un echec ponctuel ne doit pas interrompre l'affichage.
    }
  }

  function startLivePolling(): void {
    if (livePollTimer) return;
    void pollLiveScan();
    livePollTimer = setInterval(pollLiveScan, POLL_MS);
  }

  function stopLivePolling(): void {
    if (livePollTimer) clearInterval(livePollTimer);
    livePollTimer = null;
  }

  /** Onglet ouvert : charge l'historique une fois et suit le cycle en cours. */
  function activate(): void {
    if (!runs.value.length) void loadRuns();
    startLivePolling();
  }

  /** Onglet quitte : plus aucun sondage, detail replie. */
  function deactivate(): void {
    stopLivePolling();
    stopItemsPolling();
    expandedRunId.value = null;
  }

  onScopeDispose(deactivate);

  return { runs, loading, liveScan, expandedRunId, runItems, runItemsLoading, loadRuns, toggleRun, activate, deactivate };
}
