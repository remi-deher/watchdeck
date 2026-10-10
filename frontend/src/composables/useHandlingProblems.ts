import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { etatDeSurface } from '@/composables/useMediaOverlay';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import { formatDateTime } from '@/utils/format';
import { mediaDetailPath } from '@/mediaUrl';
import { queryKeys } from '@/queryKeys';
import { useToast } from '@/composables/useToast';
import type { IssueResponse, IssuesResponse } from '@/types/generated/mediaAvailability';
import type { HandleItem, HandleIssue } from '@/components/templates/handle/types';

/** La page assemble ; les projections complètes restent dans le cache partagé. */
export function useHandlingProblems() {
  const route = useRoute();
  const query = ref('');
  const status = ref('open');
  const type = ref('');
  const actionError = ref('');
  const queryClient = useQueryClient();
  const toast = useToast();
  const params = computed(() => new URLSearchParams({ status: status.value, ...(type.value ? { issue_type: type.value } : {}) }).toString());
  const result = useQuery({
    queryKey: computed(() => ['issues', params.value]),
    queryFn: () => api<IssuesResponse>(`/api/media/issues?${params.value}`),
    placeholderData: keepPreviousData,
  });
  const issues = computed(() => result.data.value?.items || []);
  const labels = computed(() => result.data.value?.type_labels || {});
  const types = computed(() => result.data.value?.types || []);
  const filtered = computed(() => {
    const needle = query.value.trim().toLowerCase();
    return issues.value.filter(issue => !needle || [issue.title, issue.message, issue.reporter_name, issue.admin_note, issue.problem.label]
      .filter(Boolean).join(' ').toLowerCase().includes(needle));
  });
  function detailLocation(issue: IssueResponse): HandleItem['to'] {
    const path = issue.library_item_id ? mediaDetailPath({ library_id: issue.library_item_id }, 'library')
      : issue.request_id ? mediaDetailPath({ request_id: issue.request_id }, 'request') : '';
    return path ? { path, state: etatDeSurface(route?.fullPath || '/issues') } : null;
  }
  const items = computed<HandleItem[]>(() => filtered.value.map(issue => ({
    key: issue.problem.key,
    title: issue.media?.title || issue.title || 'Média inconnu',
    media: issue.media || undefined,
    handling: issue.problem,
    subtitle: [issue.message, issue.reporter_name ? `Signalé par ${issue.reporter_name}` : '', formatDateTime(issue.created_at, '—')].filter(Boolean).join(' · '),
    to: detailLocation(issue),
    note: { label: 'Note interne', value: issue.admin_note || '', placeholder: 'Pourquoi ce signalement a-t-il été traité ainsi ?' },
  })));
  const groups = computed<HandleIssue[]>(() => [...new Set(filtered.value.map(issue => issue.problem.kind))].map(kind => ({
    key: kind, label: labels.value[kind] || kind,
    count: filtered.value.filter(issue => issue.problem.kind === kind).length,
    fixable: filtered.value.filter(issue => issue.problem.kind === kind && issue.problem.fixable).length,
  })));
  const mutation = useMutation({
    mutationFn: ({ issue, body }: { issue: IssueResponse; body: Record<string, unknown> }) => api<IssueResponse>(`/api/media/issues/${issue.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    retry: 0,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['issues'] }),
      queryClient.invalidateQueries({ queryKey: ['media'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.overview }),
    ]),
  });
  const retry = useMutation({
    mutationFn: (issue: IssueResponse) => api<{ success: boolean }>(`/api/media/issues/${issue.id}/retry`, { method: 'POST' }),
    retry: 0,
  });
  async function perform(run: () => Promise<unknown>): Promise<boolean> {
    actionError.value = '';
    try { await run(); return true; }
    catch (error) { actionError.value = humanizeError(error); return false; }
  }
  function source(item: HandleItem): IssueResponse | undefined {
    return issues.value.find(issue => issue.problem.key === item.key);
  }
  async function action(item: HandleItem, key: string): Promise<void> {
    const issue = source(item);
    if (!issue || !issue.problem.actions.some(action => action.key === key && !action.disabled)) return;
    if (key === 'retry') {
      await perform(async () => {
        const response = await retry.mutateAsync(issue);
        if (!response.success) throw new Error('La recherche n’a pas été acceptée par Sonarr/Radarr.');
        toast.success('Recherche relancée', 'Le signalement reste ouvert jusqu’à vérification du résultat.');
      });
      return;
    }
    const previous = issue.status;
    if (await perform(() => mutation.mutateAsync({ issue, body: { status: key } }))) {
      toast.undoable('Signalement mis à jour', 'Annuler', async () => {
        await perform(() => mutation.mutateAsync({ issue, body: { status: previous } }));
      });
    }
  }
  async function note(item: HandleItem, value: string): Promise<void> {
    const issue = source(item);
    if (issue && await perform(() => mutation.mutateAsync({ issue, body: { admin_note: value } }))) toast.success('Note enregistrée');
  }
  function reset(): void { status.value = 'open'; type.value = ''; query.value = ''; }
  async function reload(): Promise<void> { actionError.value = ''; await result.refetch(); }
  const error = computed(() => actionError.value || (result.error.value ? humanizeError(result.error.value) : ''));
  return { query, status, type, items, groups, types, labels, total: computed(() => issues.value.length), error,
    loading: result.isPending, busy: computed(() => mutation.isPending.value || retry.isPending.value), action, note, reset, reload };
}
