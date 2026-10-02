import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
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

interface AuditResponse { items?: AuditItem[]; counts?: AuditCounts }

export const VF_AUDIT_KEY = ['vf-upgrades', 'audit'] as const;

function countsOf(items: readonly AuditItem[]): AuditCounts {
  const next = emptyCounts();
  for (const item of items) {
    next.total++;
    for (const issue of item.issues || []) {
      if (next[issue] !== undefined) next[issue]++;
    }
  }
  return next;
}

/** Copie corrigee d'un media : l'element du cache n'est jamais modifie en place. */
function fixedItem(item: AuditItem, patch: StreamsFixPatch): AuditItem {
  const target = { ...item };
  if (patch.has_vf !== undefined) target.has_vf = patch.has_vf;
  if (patch.fr_is_default !== undefined) target.fr_is_default = patch.fr_is_default;
  else if (target.has_vf) target.fr_is_default = true;

  if (patch.forced_fr_status !== undefined) target.forced_fr_status = patch.forced_fr_status;
  else if (target.forced_fr_status === 'not_default') target.forced_fr_status = 'ok';

  if (patch.sub_fr_status !== undefined) target.sub_fr_status = patch.sub_fr_status;
  else if (target.sub_fr_status === 'not_default') target.sub_fr_status = 'ok';
  else if (target.sub_fr_status === 'forced_not_default') target.sub_fr_status = 'forced_default';

  target.issues = (target.issues || []).filter((issue) => !FIXED_BY_ALIGNMENT.includes(issue));
  return target;
}

/**
 * Audit des pistes Plex (onglet « Alignement des pistes »).
 *
 * Une correction ne recharge pas l'audit : le media corrige est mis a jour sur place
 * (`applyStreamsFixInPlace`), qu'elle vienne d'une action de la page ou d'un evenement
 * temps reel emis par une autre session. L'audit vit dans le cache TanStack Query
 * (`VF_AUDIT_KEY`), ou chaque correction depose une nouvelle liste.
 */
export function useVfAudit(notify: Notify) {
  const queryClient = useQueryClient();
  const auditQuery = useQuery({
    queryKey: VF_AUDIT_KEY,
    queryFn: ({ signal }) => api<AuditResponse>('/api/vf-upgrades/audit', { signal }),
  });
  watch(auditQuery.error, (e) => { if (e) notify(humanizeError(e), 'error'); });
  const items = computed<AuditItem[]>(() => auditQuery.data.value?.items || []);
  const counts = computed<AuditCounts>(() => auditQuery.data.value?.counts || emptyCounts());
  /** Premier chargement seulement : une relecture laisse l'audit affiche. */
  const loading = computed(() => auditQuery.isPending.value && auditQuery.isFetching.value);
  const fixingAll = ref(false);

  const totalCount = computed(() => counts.value.total || items.value.length || 0);
  const eligibleFixCount = computed(() => items.value.filter((item) => canFixStreams(item)).length);

  /** Relit l'audit ; un echec est signale par `notify`, jamais leve. */
  async function load(_options: { silent?: boolean } = {}): Promise<void> {
    await auditQuery.refetch();
  }

  /** Corrige des medias dans le cache et recalcule les compteurs. */
  function applyFixes(ids: readonly number[], patch: StreamsFixPatch = {}): void {
    const wanted = new Set(ids);
    queryClient.setQueryData<AuditResponse>(VF_AUDIT_KEY, (data) => {
      if (!data?.items?.some((item) => wanted.has(item.id))) return data;
      const next = data.items.map((item) => (wanted.has(item.id) ? fixedItem(item, patch) : item));
      return { ...data, items: next, counts: countsOf(next) };
    });
  }

  function applyStreamsFixInPlace(itemId: number, patch: StreamsFixPatch = {}): void {
    applyFixes([itemId], patch);
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
      applyFixes(itemIds);
    } catch (e) {
      notify(humanizeError(e), 'error');
    } finally {
      fixingAll.value = false;
    }
  }

  return { items, counts, loading, fixingAll, totalCount, eligibleFixCount, load, applyStreamsFixInPlace, fixAll };
}
