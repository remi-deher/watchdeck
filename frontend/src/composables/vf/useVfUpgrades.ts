import { computed, ref } from 'vue';
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
 */
export function useVfUpgrades(notify: Notify, undoable: (message: string, label: string, undo: () => void | Promise<void>) => unknown) {
  const items = ref<VfUpgradeItem[]>([]);
  const scan = ref<Record<string, unknown>>({});
  const loading = ref(true);
  /** Medias VO sans suggestion que le serveur n'a pas renvoyes (liste bornee). */
  const waitingTruncated = ref(0);

  const countWhere = (predicate: (item: VfUpgradeItem) => boolean) => computed(() => items.value.filter(predicate).length);
  const pendingCount = countWhere((item) => item.status === 'pending');
  const waitingReleaseCount = countWhere((item) => item.status === 'waiting_release');
  const inProgressCount = countWhere((item) => ACTIVE_STATES.has(item.status));
  const failedCount = countWhere((item) => item.status === 'failed');
  const historyCount = countWhere((item) => HISTORY_STATES.has(item.status) && !item.is_ignored);
  const ignoredCount = countWhere((item) => Boolean(item.is_ignored));

  async function load({ silent = false }: { silent?: boolean } = {}): Promise<void> {
    if (!silent && !items.value.length) loading.value = true;
    try {
      const data = await api<DashboardResponse>('/api/vf-upgrades/dashboard');
      items.value = data.items || [];
      scan.value = data.scan || {};
      waitingTruncated.value = Math.max(
        0,
        (data.waiting_total || 0) - items.value.filter((item) => item.status === 'waiting_release').length,
      );
    } catch (e) {
      notify(humanizeError(e), 'error');
    } finally {
      loading.value = false;
    }
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
    items.value = items.value.filter((entry) => entry.id !== item.id);
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

  /** Evenement temps reel sur une suggestion affichee : mise a jour sur place. */
  function patchStatus(id: number, status: VfUpgradeStatus, arrMessage?: string): boolean {
    const target = items.value.find((item) => item.id === id);
    if (!target) return false;
    target.status = status;
    if (arrMessage) target.arr_message = arrMessage;
    return true;
  }

  return {
    items, scan, loading, waitingTruncated,
    pendingCount, waitingReleaseCount, inProgressCount, failedCount, historyCount, ignoredCount,
    load, dismiss, restore, ignoreMedia, maintenance, patchStatus,
  };
}
