import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { arrQueueQuery } from '@/sharedQueries';
import { humanizeError } from '@/utils/apiError';
import { canAct, rowKey } from '@/downloads/queueRules';
import { useConfirm } from './useConfirm';
import { useToast } from './useToast';

const asList = (value: unknown): any[] => (Array.isArray(value) ? value : []);

/**
 * La file des téléchargements (Sonarr, Radarr et directs) et ce qu'on en fait, pour la page
 * « File d'attente » : les lignes, leur lecture seule, et les actions (autre release, retrait)
 * avec confirmation. Réussites et échecs sortent en toasts.
 */
export function useDownloadQueue() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

  const arrQuery = useQuery({ ...arrQueueQuery(), select: asList });
  const directQuery = useQuery({
    queryKey: ['downloads', 'direct'],
    queryFn: ({ signal }) => api('/api/downloads/direct', { signal }),
    select: asList,
    staleTime: 5_000,
  });

  /* Retiré à la main : la ligne disparaît tout de suite, avant que le serveur ne confirme. */
  const hidden = ref<Set<string>>(new Set());
  const rows = computed(() => [...(arrQuery.data.value || []), ...(directQuery.data.value || [])]
    .filter((row) => !hidden.value.has(rowKey(row)))
    .sort((a, b) => (a.progress || 0) - (b.progress || 0)));

  const pending = computed(() => (arrQuery.isPending.value || directQuery.isPending.value) && !rows.value.length);
  /* Une source en défaut ne vide pas la page : elle le dit, l'autre reste lisible. */
  const error = computed(() => [
    arrQuery.error.value ? `File Sonarr/Radarr : ${humanizeError(arrQuery.error.value)}` : '',
    directQuery.error.value ? `Téléchargements directs : ${humanizeError(directQuery.error.value)}` : '',
  ].filter(Boolean).join(' · '));
  const updatedAt = computed(() => Math.max(arrQuery.dataUpdatedAt.value, directQuery.dataUpdatedAt.value));

  async function reload(): Promise<void> {
    await Promise.allSettled([arrQuery.refetch({ cancelRefetch: true }), directQuery.refetch({ cancelRefetch: true })]);
  }
  useRealtime(['download.updated'], () => { void reload(); }, { debounceMs: 350 });

  const acting = ref<Set<string>>(new Set());
  const removal = useMutation({
    mutationFn: ({ row, blocklist }: { row: any; blocklist: boolean }) =>
      api(`/api/arr/queue/${row.instance_id}/${row.queue_id}?blocklist=${blocklist}&search=${blocklist}`, { method: 'DELETE' }),
  });

  /** Autre release (`retry`) ou retrait (`remove`) ; l'import à la main est à la page. */
  async function run(key: string, row: any): Promise<void> {
    if (!canAct(row) || (key !== 'retry' && key !== 'remove')) return;
    const retry = key === 'retry';
    const confirmed = await askConfirm({
      title: retry ? 'Chercher une autre release ?' : 'Retirer ce téléchargement ?',
      message: retry ? 'La release sera blocklistée et une nouvelle recherche sera lancée.' : 'Le téléchargement sera retiré de la file.',
      confirmLabel: retry ? 'Blocklister et rechercher' : 'Retirer',
      danger: true,
    });
    if (!confirmed) return;
    const id = rowKey(row);
    acting.value = new Set([...acting.value, id]);
    try {
      await removal.mutateAsync({ row, blocklist: retry });
      addToast({ type: 'success', message: retry ? 'Nouvelle recherche lancée.' : 'Téléchargement retiré de la file.' });
      await queryClient.invalidateQueries({ queryKey: ['downloads'] });
      await reload();
    } catch (failure) {
      addToast({ type: 'error', message: humanizeError(failure) });
    } finally {
      const next = new Set(acting.value);
      next.delete(id);
      acting.value = next;
    }
  }

  /** Une ligne importée à la main quitte la file sans attendre la relecture. */
  function hide(row: any): void { hidden.value = new Set([...hidden.value, rowKey(row)]); }

  return { rows, pending, error, updatedAt, reload, acting, run, hide, confirmDialog, resolveConfirm };
}
