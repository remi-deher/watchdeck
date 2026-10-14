import { computed, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { accountName, seerActionLabel, sourceLabel } from '@/utils/userLabels';
import { matchesSituation, situationCounts } from '@/components/users/userSituations';
import { type AppUser } from '@/components/users/userDefinitions';
import { useFiltersDrawer } from './useFiltersDrawer';
import { useToast } from './useToast';

const NO_USERS: AppUser[] = [];

/**
 * Les comptes et ce qu'on en fait, pour la page Utilisateurs : la liste, ses filtres, ses
 * situations à traiter et les actions (une ligne, la sélection, les synchronisations).
 *
 * `run(clé, comptes)` décode les clés des définitions (`userDefinitions`). Réussites et
 * échecs sortent en toasts ; seule la lecture de la liste est une erreur de page.
 */
export function useUserAccounts() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const usersQuery = useQuery({
    queryKey: queryKeys.users.list,
    queryFn: ({ signal }) => api<AppUser[]>('/api/users', { signal }),
    select: (data) => (Array.isArray(data) ? data : NO_USERS),
    staleTime: 30_000,
  });
  const users = computed(() => usersQuery.data.value || NO_USERS);
  const pending = computed(() => usersQuery.isPending.value);
  const loading = computed(() => usersQuery.isFetching.value);
  const error = computed(() => (usersQuery.error.value ? humanizeError(usersQuery.error.value) : ''));

  /* L'état de Seer conditionne ses actions. Lu une fois : la page est réservée aux
     administrateurs, /api/settings leur est accessible. Inconnu, on n'en propose pas
     plutôt que d'offrir une action qui échouerait. */
  const settingsQuery = useQuery({
    queryKey: ['settings', 'seer-state'] as const,
    queryFn: ({ signal }) => api<{ seer_enabled?: boolean; seer_mode?: string | null }>('/api/settings', { signal }),
    staleTime: 60_000,
    retry: false,
  });
  const seerEnabled = computed(() => Boolean(settingsQuery.data.value?.seer_enabled));
  const seerMode = computed(() => settingsQuery.data.value?.seer_mode || null);
  const seerLabel = computed(() => seerActionLabel(seerEnabled.value, seerMode.value as 'actor' | 'observer' | null));
  const seerHint = computed(() => (seerMode.value === 'actor'
    ? 'Seer traite aussi les demandes : la synchronisation est bidirectionnelle.'
    : 'Seer est en mode observateur : ses comptes sont relus, rien ne lui est envoyé.'));

  const query = ref('');
  const status = ref('');
  const role = ref('');
  const attention = ref('');
  const source = ref('');
  /* Les filtres du panneau (statut, rôle, origine) comptent sur le bouton ; la recherche et
     la situation sont visibles à côté, elles ne s'y ajoutent pas. */
  const { activeCount: filterCount, reset } = useFiltersDrawer(
    { query, status, role, attention, source },
    { query: '', status: '', role: '', attention: '', source: '' },
    { memoriser: 'utilisateurs', activeCountFn: () => [status, role, source].filter((filter) => filter.value).length },
  );

  const sources = computed(() => [...new Set(users.value.map((user) => user.source).filter(Boolean))] as string[]);
  const sourceOptions = computed(() => sources.value.map((value) => ({ value, label: sourceLabel(value) })));

  /* Les compteurs et les lignes viennent de la même règle (`userSituations`) : la puce ne peut
     pas annoncer un nombre que le tableau ne montre pas. */
  const counts = computed(() => situationCounts(users.value));
  const situations = computed(() => [
    { value: 'pending', label: 'Approbations', count: counts.value.pending },
    { value: 'missing_email', label: 'Sans email', count: counts.value.missing_email },
    { value: 'notification_error', label: 'Échec d’envoi', count: counts.value.notification_error },
  ]);

  /* Le pseudo du service d'origine (`display_name`) était exclu de la recherche dès qu'un nom
     personnalisé existait : chercher « GachaBlock » ne trouvait pas Romain. */
  const filtered = computed(() => {
    const needle = query.value.toLowerCase();
    return users.value
      .filter((user) =>
        (!needle || `${accountName(user)} ${user.display_name || ''} ${user.plex_user_id} ${user.plex_email || ''} ${user.notification_email || ''}`.toLowerCase().includes(needle))
        && (!status.value || (status.value === 'enabled') === Boolean(user.enabled))
        && (!role.value || user.role === role.value)
        && matchesSituation(user, attention.value)
        && (!source.value || user.source === source.value))
      .sort((a, b) => accountName(a).localeCompare(accountName(b), 'fr'));
  });

  /** Relit la liste ; `invalidateQueries` attend la nouvelle réponse. */
  async function reload(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  }

  const busy = ref(false);
  async function perform(task: () => Promise<unknown>, success: string | ((result: any) => string)): Promise<void> {
    busy.value = true;
    try {
      const result = await task();
      addToast({ type: 'success', message: typeof success === 'function' ? success(result) : success });
      await reload();
    } catch (failure) {
      addToast({ type: 'error', message: humanizeError(failure) });
    } finally {
      busy.value = false;
    }
  }
  const put = (path: string, body: unknown) => api(path, { method: 'PUT', body: JSON.stringify(body) });
  const post = (path: string, body?: unknown) => api(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  /** Une action des définitions, sur les comptes visés. `open` et `create` sont à la page. */
  async function run(key: string, targets: AppUser[]): Promise<void> {
    const [action, first, second] = key.split(':');
    const ids = targets.map((user) => user.id);
    if (action === 'sync-plex') {
      return perform(() => post('/api/plex/sync/users'), (result) => `Synchronisation Plex terminée : ${result?.created || 0} ajouté(s), ${result?.updated || 0} mis à jour.`);
    }
    if (action === 'sync-seer') return perform(() => post('/api/seer/sync'), 'Synchronisation Seer terminée.');
    if (action === 'toggle') {
      const [user] = targets;
      return perform(() => put(`/api/users/${user.id}/enabled`, { enabled: !user.enabled }), `${accountName(user)} : compte ${user.enabled ? 'désactivé' : 'activé'}.`);
    }
    if (action === 'status') return perform(() => put('/api/users/bulk/status', { user_ids: ids, enabled: first === 'on' }), 'Statut mis à jour.');
    if (action === 'notify') return perform(() => put('/api/users/bulk/notifications', { user_ids: ids, [first]: second === 'on' }), 'Notifications mises à jour.');
    if (action === 'role') return perform(() => put('/api/users/bulk/permissions', { user_ids: ids, role: first }), 'Permissions mises à jour.');
    if (action === 'login') return perform(() => put('/api/users/bulk/permissions', { user_ids: ids, can_login: first === 'on' }), 'Permissions mises à jour.');
    if (action === 'delete') return perform(() => post('/api/users/bulk/delete', { user_ids: ids }), `${ids.length} compte${ids.length > 1 ? 's' : ''} supprimé${ids.length > 1 ? 's' : ''}.`);
  }

  return {
    users, filtered, pending, loading, error, reload,
    query, status, role, attention, source, sourceOptions, situations, filterCount, reset,
    busy, run,
    seerEnabled, seerLabel, seerHint,
  };
}
