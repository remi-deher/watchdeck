import { computed, ref } from 'vue';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import { canFixStreams } from '@/utils/vfUpgradeLabels';
import type { AuditCounts, AuditItem, Notify, StreamsFixPatch } from './types';

const emptyCounts = (): AuditCounts => ({
  total: 0,
  audio_secondary: 0,
  sub_fr_not_default: 0,
  forced_sub_not_default: 0,
  partial_vf: 0,
});

/** Anomalies que l'alignement des pistes corrige : elles disparaissent apres coup. */
const FIXED_BY_ALIGNMENT = ['audio_secondary', 'forced_sub_not_default', 'sub_fr_not_default'];

/**
 * Audit des pistes Plex (onglet « Alignement des pistes »).
 *
 * Une correction ne recharge pas l'audit : le media corrige est mis a jour sur place
 * (`applyStreamsFixInPlace`), qu'elle vienne d'une action de la page ou d'un evenement
 * temps reel emis par une autre session.
 */
export function useVfAudit(notify: Notify) {
  const items = ref<AuditItem[]>([]);
  const counts = ref<AuditCounts>(emptyCounts());
  const loading = ref(false);
  const fixingAll = ref(false);

  const totalCount = computed(() => counts.value.total || items.value.length || 0);
  const eligibleFixCount = computed(() => items.value.filter((item) => canFixStreams(item)).length);

  async function load({ silent = false }: { silent?: boolean } = {}): Promise<void> {
    if (!silent && !items.value.length) loading.value = true;
    try {
      const data = await api<{ items?: AuditItem[]; counts?: AuditCounts }>('/api/vf-upgrades/audit');
      items.value = data.items || [];
      counts.value = data.counts || emptyCounts();
    } catch (e) {
      notify(humanizeError(e), 'error');
    } finally {
      loading.value = false;
    }
  }

  function recomputeCounts(): void {
    const next = emptyCounts();
    for (const item of items.value) {
      next.total++;
      for (const issue of item.issues || []) {
        if (next[issue] !== undefined) next[issue]++;
      }
    }
    counts.value = next;
  }

  function applyStreamsFixInPlace(itemId: number, patch: StreamsFixPatch = {}): void {
    const target = items.value.find((item) => item.id === itemId);
    if (!target) return;
    if (patch.has_vf !== undefined) target.has_vf = patch.has_vf;
    if (patch.fr_is_default !== undefined) target.fr_is_default = patch.fr_is_default;
    else if (target.has_vf) target.fr_is_default = true;

    if (patch.forced_fr_status !== undefined) target.forced_fr_status = patch.forced_fr_status;
    else if (target.forced_fr_status === 'not_default') target.forced_fr_status = 'ok';

    if (patch.sub_fr_status !== undefined) target.sub_fr_status = patch.sub_fr_status;
    else if (target.sub_fr_status === 'not_default') target.sub_fr_status = 'ok';
    else if (target.sub_fr_status === 'forced_not_default') target.sub_fr_status = 'forced_default';

    target.issues = (target.issues || []).filter((issue) => !FIXED_BY_ALIGNMENT.includes(issue));
    recomputeCounts();
  }

  /** Aligne d'un coup les medias alignables parmi `source` -- ceux affiches, filtres
   *  compris : « Tout aligner » ne touche jamais un media masque par un filtre. */
  async function fixAll(source: readonly AuditItem[] = items.value): Promise<void> {
    const eligible = source.filter((item) => canFixStreams(item));
    if (!eligible.length) return;
    fixingAll.value = true;
    try {
      const itemIds = eligible.map((item) => item.id);
      const res = await api<{ processed_items?: number }>('/api/vf-upgrades/audit/fix-streams-batch', {
        method: 'POST',
        body: JSON.stringify({ item_ids: itemIds }),
      });
      notify(`${res.processed_items || 0} média(s) réaligné(s) sur Plex.`);
      itemIds.forEach((id) => applyStreamsFixInPlace(id));
    } catch (e) {
      notify(humanizeError(e), 'error');
    } finally {
      fixingAll.value = false;
    }
  }

  return { items, counts, loading, fixingAll, totalCount, eligibleFixCount, load, applyStreamsFixInPlace, fixAll };
}
