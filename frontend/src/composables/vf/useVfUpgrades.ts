import { computed, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import type { VfUpgradeGroup, VfUpgradeItem, VfUpgradeStatus } from '@/types/vfUpgrades';
import type { Notify } from './types';

const ACTIVE_STATES = new Set(['accepted', 'downloading', 'importing', 'awaiting_verification']);
const HISTORY_STATES = new Set(['verified', 'dismissed', 'grabbed']);

interface DashboardResponse {
  items?: VfUpgradeItem[];
  scan?: Record<string, unknown>;
  waiting_total?: number;
}

/**
 * Suggestions de releases VF (onglet « Releases & Telechargements »).
 *
 * `undoable` affiche une notification munie d'un retour arriere : « Ignorer » se
 * repete une fois par ligne et se clique vite, et recuperer une suggestion ecartee par
 * erreur ne doit pas exiger une nouvelle recherche complete.
 *
 * La liste vit dans le cache TanStack Query (`VF_UPGRADES_KEY`) : les retraits et les
 * evenements temps reel y deposent une NOUVELLE liste, jamais un element modifie en
 * place (voir useRealtimeQuery).
 */
export const VF_UPGRADES_KEY = ['vf-upgrades', 'dashboard'] as const;

export function useVfUpgrades(notify: Notify, undoable: (message: string, label: string, undo: () => void | Promise<void>) => unknown) {
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery({
    queryKey: VF_UPGRADES_KEY,
    queryFn: ({ signal }) => api<DashboardResponse>('/api/vf-upgrades/dashboard', { signal }),
  });
  watch(dashboardQuery.error, (e) => { if (e) notify(humanizeError(e), 'error'); });
  const items = computed<VfUpgradeItem[]>(() => dashboardQuery.data.value?.items || []);
  const scan = computed<Record<string, unknown>>(() => dashboardQuery.data.value?.scan || {});
  /** Premier chargement seulement : une relecture laisse la liste affichee. */
  const loading = computed(() => dashboardQuery.isPending.value);
  /** Medias VO sans suggestion que le serveur n'a pas renvoyes (liste bornee). */
  const waitingTruncated = computed(() => Math.max(
    0,
    (dashboardQuery.data.value?.waiting_total || 0) - items.value.filter((item) => item.status === 'waiting_release').length,
  ));

  function setItems(update: (list: VfUpgradeItem[]) => VfUpgradeItem[]): void {
    queryClient.setQueryData<DashboardResponse>(VF_UPGRADES_KEY, (data) => (data ? { ...data, items: update(data.items || []) } : data));
  }

  const countWhere = (predicate: (item: VfUpgradeItem) => boolean) => computed(() => items.value.filter(predicate).length);
  const pendingCount = countWhere((item) => item.status === 'pending');
  const waitingReleaseCount = countWhere((item) => item.status === 'waiting_release');
  const inProgressCount = countWhere((item) => ACTIVE_STATES.has(item.status));
  const failedCount = countWhere((item) => item.status === 'failed');
  const historyCount = countWhere((item) => HISTORY_STATES.has(item.status) && !item.is_ignored);
  const ignoredCount = countWhere((item) => Boolean(item.is_ignored));

  /** Relit la liste ; un echec est signale par `notify`, jamais leve. `silent` est garde
   *  pour les appelants : la liste deja affichee reste en place pendant la relecture. */
  async function load(_options: { silent?: boolean } = {}): Promise<void> {
    await dashboardQuery.refetch();
  }

  async function restore(item: VfUpgradeItem): Promise<void> {
    try {
      await api(`/api/vf-upgrades/${item.id}/restore`, { method: 'POST' });
      await load({ silent: true });
      notify('Suggestion rétablie.');
    } catch (e) {
      notify(humanizeError(e), 'error');
    }
  }

  async function dismiss(item: VfUpgradeItem): Promise<void> {
    await api(`/api/vf-upgrades/${item.id}/dismiss`, { method: 'POST' });
    setItems((list) => list.filter((entry) => entry.id !== item.id));
    undoable('Suggestion ignorée.', 'Annuler', () => restore(item));
  }

  async function ignoreMedia(group: Pick<VfUpgradeGroup, 'source_type' | 'source_id'>, ignored: boolean): Promise<void> {
    try {
      await api('/api/vf-upgrades/ignore', {
        method: 'POST',
        body: JSON.stringify({ source_type: group.source_type, source_id: group.source_id, ignored }),
      });
      notify(ignored ? 'Média ignoré : le scan de fond ne le reproposera plus.' : 'Média réactivé.');
      await load({ silent: true });
    } catch (e) {
      notify(humanizeError(e), 'error');
    }
  }

  async function maintenance(action: 'recompute' | 'purge'): Promise<void> {
    try {
      const result = await api<{ deleted?: number; updated?: number }>('/api/vf-upgrades/maintenance', {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      notify(action === 'purge' ? `${result.deleted} entrée(s) supprimée(s).` : `${result.updated} suggestion(s) réouverte(s).`);
      await load({ silent: true });
    } catch (e) {
      notify(humanizeError(e), 'error');
    }
  }

  /** Evenement temps reel sur une suggestion affichee : la liste du cache est remplacee. */
  function patchStatus(id: number, status: VfUpgradeStatus, arrMessage?: string): boolean {
    if (!items.value.some((item) => item.id === id)) return false;
    setItems((list) => list.map((item) => (item.id === id ? { ...item, status, ...(arrMessage ? { arr_message: arrMessage } : {}) } : item)));
    return true;
  }

  return {
    items, scan, loading, waitingTruncated,
    pendingCount, waitingReleaseCount, inProgressCount, failedCount, historyCount, ignoredCount,
    load, dismiss, restore, ignoreMedia, maintenance, patchStatus,
  };
}
