import { computed, ref, type Ref } from 'vue';
import { refDebounced } from '@vueuse/core';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatDateTimeShort } from '@/utils/format';
import {
  notificationContext, notificationFailed, notificationName, notificationRecipients, type NotificationRow,
} from '@/components/notifications/notificationDefinitions';
import type { UnderstandDetail, UnderstandEvent } from '@/components/templates/UnderstandTemplate.vue';
import { useFiltersDrawer } from './useFiltersDrawer';
import { useToast } from './useToast';

const PAGE_SIZE = 50;
const NO_ROWS: NotificationRow[] = [];
interface Page { items?: NotificationRow[]; total?: number }

/* Les listes se lisent par paquets au défilement : la page suivante commence là où les
   précédentes s'arrêtent. */
const nextOffset = (last: Page, pages: Page[]): number | undefined => {
  const loaded = pages.reduce((count, page) => count + (page.items?.length || 0), 0);
  return loaded < (last.total || 0) ? loaded : undefined;
};
const rowsOf = (pages: Page[] | undefined): NotificationRow[] => (pages ? pages.flatMap((page) => page.items || []) : NO_ROWS);

/** Relit tout ce qui touche aux notifications : listes, suspension, aperçus. */
export function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  // Invalider `['notifications']` relit la liste affichée et le compteur de suspension.
  useRealtime(['notification.updated'], () => { void invalidate(); }, { debounceMs: 250 });
  return invalidate;
}

/* Une action sur les notifications : succès et échec en toasts, puis relecture. */
function useNotificationAction(invalidate: () => Promise<unknown>) {
  const { addToast } = useToast();
  const busy = ref(false);
  async function perform(task: () => Promise<unknown>, success: string): Promise<void> {
    busy.value = true;
    try {
      await task();
      addToast({ type: 'success', message: success });
      await invalidate();
    } catch (failure) {
      addToast({ type: 'error', message: humanizeError(failure) });
    } finally {
      busy.value = false;
    }
  }
  return { busy, perform };
}
const post = (path: string, body?: unknown) => api(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/**
 * La file d'attente : les notifications qui n'ont pas encore été envoyées, et ce qu'on en
 * fait (envoyer, marquer traitée, supprimer — une, la sélection, ou toute la file).
 * `run(clé, lignes)` décode les clés de `notificationDefinitions`.
 */
export function useNotificationQueue(invalidate: () => Promise<unknown>, enabled: Ref<boolean>) {
  const query = useInfiniteQuery({
    queryKey: ['notifications', 'pending'] as const,
    queryFn: ({ pageParam, signal }) => api<Page>(`/api/notifications/pending?limit=${PAGE_SIZE}&offset=${pageParam}`, { signal }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled,
    staleTime: 10_000,
  });
  const rows = computed(() => rowsOf(query.data.value?.pages));
  const total = computed(() => query.data.value?.pages.at(-1)?.total || 0);
  const { busy, perform } = useNotificationAction(invalidate);

  async function run(key: string, targets: NotificationRow[]): Promise<void> {
    const everything = key.startsWith('all:');
    const [action] = everything ? [key.slice(4)] : [key];
    const ids = targets.map((row) => row.id);
    // Sans identifiant, le serveur traite toute la file.
    const purge = (markHandled: boolean) => post('/api/notifications/pending/purge', { ids, mark_handled: markHandled });
    const count = everything ? 'Toute la file' : `${ids.length} notification${ids.length > 1 ? 's' : ''}`;
    if (action === 'send') return perform(() => post('/api/notifications/pending/process', { ids }), `${count} envoyée${ids.length > 1 ? 's' : ''}.`);
    if (action === 'handled') return perform(() => purge(true), `${count} marquée${everything || ids.length > 1 ? 's' : ''} comme traitée${everything || ids.length > 1 ? 's' : ''}.`);
    if (action === 'delete') return perform(() => purge(false), `${count} supprimée${everything || ids.length > 1 ? 's' : ''}.`);
  }

  return {
    rows, total, busy, run,
    pending: computed(() => query.isPending.value),
    loading: computed(() => query.isFetching.value && !query.isFetchingNextPage.value),
    hasMore: computed(() => Boolean(query.hasNextPage.value)),
    loadingMore: computed(() => query.isFetchingNextPage.value),
    loadMore: () => { if (query.hasNextPage.value && !query.isFetchingNextPage.value) void query.fetchNextPage(); },
    error: computed(() => (query.error.value ? humanizeError(query.error.value) : '')),
  };
}

/**
 * Le journal : ce qui a été envoyé, du plus récent au plus ancien, avec ses filtres (état
 * au-dessus de la liste ; type et utilisateur dans le panneau) et le détail d'un envoi (son
 * aperçu, et « Renvoyer » quand il a échoué).
 */
export function useNotificationHistory(invalidate: () => Promise<unknown>, enabled: Ref<boolean>) {
  const search = ref('');
  const state = ref('');
  const types = ref<string[]>([]);
  const selectedUsers = ref<Array<string | number>>([]);
  const serverSearch = refDebounced(search, 300);
  /* Le type et l'utilisateur comptent sur le bouton ; l'état et la recherche sont visibles à côté. */
  const { activeCount: filterCount, reset } = useFiltersDrawer(
    { search, state, types, selectedUsers },
    { search: '', state: '', types: [], selectedUsers: [] },
    { activeCountFn: () => types.value.length + selectedUsers.value.length, memoriser: 'notifications' },
  );

  // Même clé que la page Utilisateurs : les deux écrans partagent le cache.
  const usersQuery = useQuery({
    queryKey: queryKeys.users.list,
    queryFn: ({ signal }) => api<Array<{ id: number | string; custom_name?: string; display_name?: string; plex_user_id?: string }>>('/api/users', { signal }),
    select: (data) => (Array.isArray(data) ? data : []),
    enabled,
    staleTime: 30_000,
  });
  const userOptions = computed(() => (usersQuery.data.value || []).map((user) => ({
    value: user.id,
    label: user.custom_name || user.display_name || user.plex_user_id || String(user.id),
  })));

  const query = useInfiniteQuery({
    queryKey: computed(() => ['notifications', 'history', {
      state: state.value, types: types.value.join(','), users: selectedUsers.value.join(','), search: serverSearch.value,
    }] as const),
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam), sort: 'date', direction: 'desc' });
      if (state.value) params.append('state', state.value);
      if (types.value.length) params.append('types', types.value.join(','));
      if (selectedUsers.value.length) params.append('users', selectedUsers.value.join(','));
      if (serverSearch.value) params.append('search', serverSearch.value);
      return api<Page>(`/api/notifications/log?${params}`, { signal });
    },
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled,
    staleTime: 10_000,
  });
  const rows = computed(() => rowsOf(query.data.value?.pages));

  const events = computed<UnderstandEvent[]>(() => rows.value.map((row) => ({
    key: String(row.id),
    at: String(row.sent_at || row.created_at || ''),
    outcome: notificationFailed(row) ? 'failed' : 'success',
    title: row.media_title || notificationName(row),
    detail: [row.media_title ? notificationName(row) : '', notificationContext(row), notificationFailed(row) ? row.error_msg : ''].filter(Boolean).join(' · '),
    context: notificationRecipients(row),
  })));

  /* Le détail d'un envoi : l'aperçu de l'email, lu à l'ouverture. */
  const openKey = ref('');
  const openRow = computed(() => rows.value.find((row) => String(row.id) === openKey.value) || null);
  const previewQuery = useQuery({
    queryKey: computed(() => ['notifications', 'preview', openKey.value] as const),
    queryFn: ({ signal }) => api<{ subject?: string; html?: string; note?: string; reconstructable?: boolean }>(`/api/notifications/${openKey.value}/preview`, { signal }),
    enabled: computed(() => Boolean(openRow.value)),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const detail = computed<UnderstandDetail | null>(() => {
    const row = openRow.value;
    if (!row) return null;
    const preview = previewQuery.data.value;
    const failed = notificationFailed(row);
    return {
      title: row.media_title || notificationName(row),
      subtitle: [formatDateTimeShort(row.sent_at || row.created_at), notificationRecipients(row)].filter(Boolean).join(' · '),
      outcome: failed ? 'failed' : 'success',
      cause: failed ? (row.error_msg || 'Envoi en échec') : undefined,
      tags: [notificationName(row), ...notificationContext(row).split(' · ')].filter(Boolean),
      preview: {
        loading: previewQuery.isPending.value,
        error: previewQuery.error.value ? humanizeError(previewQuery.error.value) : '',
        note: preview?.note || (preview && preview.reconstructable === false ? "Aperçu indisponible pour ce type d'événement." : ''),
        html: preview?.html || '',
        label: preview?.subject ? `Aperçu : ${preview.subject}` : 'Aperçu email',
      },
      action: failed ? { key: 'resend', label: 'Renvoyer' } : undefined,
    };
  });

  const { busy, perform } = useNotificationAction(invalidate);
  function resend(): Promise<void> | undefined {
    const row = openRow.value;
    return row ? perform(() => post(`/api/notifications/${row.id}/resend`), 'Notification renvoyée.') : undefined;
  }

  return {
    search, state, types, selectedUsers, userOptions, filterCount, reset,
    events, openKey, detail, resend, busy,
    pending: computed(() => query.isPending.value),
    hasMore: computed(() => Boolean(query.hasNextPage.value)),
    loadingMore: computed(() => query.isFetchingNextPage.value),
    loadMore: () => { if (query.hasNextPage.value && !query.isFetchingNextPage.value) void query.fetchNextPage(); },
    error: computed(() => (query.error.value ? humanizeError(query.error.value) : '')),
  };
}

/** Le suivi des envois (clé d'envoi, état chez le fournisseur) : lu à l'ouverture seulement. */
export function useNotificationDeliveries() {
  const opened = ref(false);
  const query = useQuery({
    queryKey: ['notifications', 'deliveries'] as const,
    queryFn: ({ signal }) => api<{ items?: Array<Record<string, any>> }>('/api/notifications/deliveries', { signal }),
    select: (data) => data?.items || [],
    enabled: opened,
    staleTime: 15_000,
  });
  return { open: () => { opened.value = true; }, rows: computed(() => query.data.value || []), error: computed(() => (query.error.value ? humanizeError(query.error.value) : '')) };
}
