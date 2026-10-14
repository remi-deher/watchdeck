import { computed, onMounted, ref, watch } from 'vue';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { mediaDetailPath } from '@/mediaUrl';
import { useRealtimeQuery } from '@/composables/useRealtimeQuery';
import { useToast } from '@/composables/useToast';
import { usePreference } from '@/composables/usePreference';
import { chipsFromGroups, type FilterGroupDefinition } from '@/composables/useFiltersDrawer';
import { canModerateSession, isAdminSession, loadSession } from '@/composables/useSession';
import { isRefused, requestTabOf, toRecent, toTrackItem, type RequestTab } from '@/requests/requestTracking';
import type { SubnavItem } from '@/components/ui/AppSubnav.vue';
import type { TrackItem } from '@/components/templates/track/types';
import type { AvailabilityPage, RequestJourneyRecord } from '@/types/generated/mediaAvailability';

type RequestsPayload = AvailabilityPage & { facets?: { requesters?: Array<{ id: string; label: string }> } };

const PAGE_SIZE = 48;
const TYPE_OPTIONS = [
  { value: '', label: 'Tous les médias' },
  { value: 'movie', label: 'Films' },
  { value: 'show', label: 'Séries' },
];
const VF_OPTIONS = [
  { value: '', label: 'Toutes les pistes' },
  { value: 'vf', label: 'VF disponible' },
  { value: 'vf_secondary', label: 'VF non prioritaire' },
  { value: 'mixed', label: 'VF partielle' },
  { value: 'vo', label: 'VO uniquement' },
  { value: 'unchecked', label: 'Non analysée' },
];
const SORT_OPTIONS = [
  { value: '', label: 'Plus récentes' },
  { value: 'oldest', label: 'Plus anciennes' },
  { value: 'title', label: 'Titre A→Z' },
];

/**
 * Donnees et actions de « Mes demandes » : ce qu'on a demande, suivi (gabarit Suivre) tant
 * que ca n'est pas arrive, exploré (gabarit Explorer) une fois disponible. La liste est
 * chargee d'un bloc et filtree sur place ; la page n'en tire que de quoi afficher.
 */
export function useMyRequests() {
  const route = useRoute();
  const router = useRouter();
  const toast = useToast();

  const canModerate = ref(false);
  const isAdmin = ref(false);
  const plexUserId = ref('');
  /* La session porte l'identite du demandeur : tant qu'elle n'est pas resolue, charger
     reviendrait a demander « les demandes de personne ». Un compte sans `plex_user_id`
     reste servi : il voit tout ce que l'API lui autorise. */
  const sessionReady = ref(false);
  const busy = ref(false);

  const query = ref('');
  const typeKey = ref('');
  const vf = ref('');
  const requesterKey = ref('');
  const sort = ref('');
  const view = usePreference<'grid' | 'list'>('library.view', 'grid');

  /* La recherche ne part au serveur qu'a sa validation (ou avec un filtre) : la liste
     chargee est ensuite filtree sur place. */
  const submittedQuery = ref('');
  function params(): URLSearchParams {
    const p = new URLSearchParams({ limit: '500' });
    if (!requesterKey.value) { if (plexUserId.value) p.set('requesters', plexUserId.value); }
    else if (requesterKey.value !== 'all') p.set('requesters', requesterKey.value);
    if (submittedQuery.value) p.set('query', submittedQuery.value);
    if (typeKey.value) p.set('media_types', typeKey.value);
    if (vf.value) p.set('vf', vf.value);
    return p;
  }
  const requestsKey = computed(() => ['requests', 'mine', params().toString()]);
  const requestsQuery = useQuery({
    queryKey: requestsKey,
    queryFn: ({ signal }) => api<RequestsPayload>(`/api/requests-list?${params()}`, { signal }),
    enabled: sessionReady,
    // Garder la liste precedente pendant qu'un filtre recharge, plutot que de la vider.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const items = computed<any[]>(() => requestsQuery.data.value?.items || []);
  const requesters = computed(() => requestsQuery.data.value?.facets?.requesters || []);
  const loading = computed(() => requestsQuery.isFetching.value);
  const error = computed(() => (requestsQuery.error.value ? humanizeError(requestsQuery.error.value) : ''));

  watch([typeKey, vf, requesterKey], () => { submittedQuery.value = query.value.trim(); });
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  watch(query, (value) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { submittedQuery.value = value.trim(); }, 250);
  });

  async function reload(): Promise<void> {
    if (!sessionReady.value) return;
    submittedQuery.value = query.value.trim();
    await requestsQuery.refetch();
  }

  // Les evenements invalident le parcours projete, qui est recalcule par le serveur.
  useRealtimeQuery<RequestsPayload, RequestJourneyRecord>(requestsKey, ['request.updated', 'download.updated'], {
    invalidateOnly: true,
    keyFields: ['request_id', 'id'],
    getList: (data) => data.items || [],
    setList: (data, list) => ({ ...data, items: list }),
  });

  /* Onglet dans l'adresse (?onglet=) : partageable, retrouve au retour. Sans choix, « Suivi »
     s'il y a quelque chose a suivre, sinon « Disponibles ». */
  const tracked = computed(() => items.value.filter((request) => requestTabOf(request) === 'suivi'));
  const available = computed(() => items.value.filter((request) => requestTabOf(request) === 'disponibles' && !isRefused(request)));
  const refused = computed(() => items.value.filter(isRefused));
  const activeTab = computed<RequestTab>(() => {
    const asked = String(route.query.onglet || '');
    if (asked === 'manquants' && isAdmin.value) return 'manquants';
    if (asked === 'suivi' || asked === 'disponibles') return asked;
    return tracked.value.length || refused.value.length || !items.value.length ? 'suivi' : 'disponibles';
  });
  const tabs = computed<SubnavItem[]>(() => {
    const to = (onglet: string) => ({ path: route.path, query: { ...route.query, onglet } });
    return [
      { key: 'suivi', label: 'Suivi', count: tracked.value.length, to: to('suivi') },
      { key: 'disponibles', label: 'Disponibles', count: available.value.length, to: to('disponibles') },
      ...(isAdmin.value ? [{ key: 'manquants', label: 'Éléments manquants', to: to('manquants') }] : []),
    ];
  });

  // Suivre : les demandes en route, les refusees en « derniers termines ».
  const trackItems = computed<TrackItem[]>(() => tracked.value.map((request) => toTrackItem(request, canModerate.value)));
  const recent = computed(() => refused.value.map(toRecent));

  // Explorer : les demandes arrivees, triees, par fenetre de rendu.
  const sorted = computed(() => {
    const list = [...available.value];
    if (sort.value === 'oldest') list.sort((a, b) => (a.requested_at || '').localeCompare(b.requested_at || ''));
    else if (sort.value === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else list.sort((a, b) => (b.requested_at || '').localeCompare(a.requested_at || ''));
    return list;
  });
  const visibleCount = ref(PAGE_SIZE);
  const visible = computed(() => sorted.value.slice(0, visibleCount.value));
  const hasMore = computed(() => visibleCount.value < sorted.value.length);
  function loadMore(): void { visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, sorted.value.length); }
  // On surveille les criteres, pas la liste : un evenement temps reel ne doit pas remonter la page.
  watch([activeTab, typeKey, vf, requesterKey, sort, submittedQuery], () => { visibleCount.value = PAGE_SIZE; });

  // Filtres : des definitions (donnees), rendues par les composants communs.
  const defaultRequester = computed(() => (isAdmin.value ? 'all' : ''));
  const requesterOptions = computed(() => [
    plexUserId.value ? { value: '', label: 'Mes demandes' } : { value: '', label: 'Tous les demandeurs' },
    ...(plexUserId.value ? [{ value: 'all', label: 'Tous les demandeurs' }] : []),
    ...requesters.value
      .filter((entry) => entry.id && entry.id !== plexUserId.value)
      .map((entry) => ({ value: entry.id, label: entry.label })),
  ]);
  const filterGroups = computed<FilterGroupDefinition[]>(() => [
    { key: 'type', label: 'Type de média', options: TYPE_OPTIONS, value: typeKey.value, fallback: '', set: (value) => { typeKey.value = value; } },
    ...(isAdmin.value && requesterOptions.value.length > 1
      ? [{ key: 'requester', label: 'Demandeur', options: requesterOptions.value, value: requesterKey.value, fallback: defaultRequester.value, set: (value: string) => { requesterKey.value = value; } }]
      : []),
    { key: 'vf', label: 'Version française', options: VF_OPTIONS, value: vf.value, fallback: '', set: (value) => { vf.value = value; } },
  ]);
  const chips = computed(() => chipsFromGroups([
    ...filterGroups.value,
    ...(activeTab.value === 'disponibles'
      ? [{ key: 'sort', label: 'Tri', options: SORT_OPTIONS, value: sort.value, fallback: '', set: (value: string) => { sort.value = value; } }]
      : []),
  ]));
  const activeFilterCount = computed(() => chips.value.length);
  function resetFilters(): void {
    typeKey.value = '';
    vf.value = '';
    requesterKey.value = defaultRequester.value;
    sort.value = '';
    query.value = '';
  }

  function openDetail(item: any): void {
    void ouvrirFiche(router, mediaDetailPath(item, 'request', { discover: true }), route.fullPath);
  }

  /* L'annulation et le refus demandent une explication : elle previent le demandeur par
     mail, et l'annulation bloque le retour automatique du media. Le motif se choisit dans
     une liste partagee plutot que de se ressaisir a chaque fois. */
  const pendingWithdraw = ref<any | null>(null);
  const pendingReject = ref<any | null>(null);
  const ACTION_DONE: Record<string, string> = {
    approve: 'Demande approuvée',
    retry: 'Recherche relancée',
    reject: 'Demande refusée',
    withdraw: 'Demande annulée',
  };

  async function runAction(row: any, action: string, body?: string): Promise<void> {
    busy.value = true;
    try {
      await api(`/api/requests/${row.id}/${action}`, { method: 'POST', body });
      toast.success(ACTION_DONE[action] || 'Action effectuée', row.title);
      await reload();
    } catch (e: any) {
      toast.error('Action impossible', humanizeError(e));
    } finally {
      busy.value = false;
    }
  }

  /** Une action du gabarit Suivre : la cle vient de `requestActions`, l'element de `request-<id>`. */
  function onTrackAction(item: TrackItem, action: string): void {
    const row = tracked.value.find((request) => `request-${request.id}` === item.key);
    if (!row) return;
    if (action === 'withdraw') pendingWithdraw.value = row;
    else if (action === 'reject') pendingReject.value = row;
    // Recherche interactive des releases (la VF y est mise en avant), dans la feuille.
    else if (action === 'interactive') void ouvrirFiche(router, `/releases/${row.id}`, route.fullPath);
    else void runAction(row, action);
  }
  async function confirmWithdraw(reason: string): Promise<void> {
    const row = pendingWithdraw.value;
    pendingWithdraw.value = null;
    if (row) await runAction(row, 'withdraw', JSON.stringify({ reason }));
  }
  async function confirmReject(reason: string): Promise<void> {
    const row = pendingReject.value;
    pendingReject.value = null;
    if (row) await runAction(row, 'reject', JSON.stringify({ reason }));
  }

  onMounted(async () => {
    const session = await loadSession();
    canModerate.value = canModerateSession(session);
    isAdmin.value = isAdminSession(session);
    // Un administrateur suit toutes les demandes ; un utilisateur, les siennes.
    if (isAdmin.value && !requesterKey.value) requesterKey.value = 'all';
    plexUserId.value = session?.plex_user_id || '';
    sessionReady.value = true;
  });

  return {
    query, view, sort, sortOptions: SORT_OPTIONS, busy, isAdmin,
    activeTab, tabs, items, loading, error, reload,
    trackItems, recent, onTrackAction,
    visible, total: computed(() => sorted.value.length), hasMore, loadMore,
    filterGroups, chips, activeFilterCount, resetFilters,
    openDetail, canModerate,
    pendingWithdraw, pendingReject, confirmWithdraw, confirmReject,
  };
}
