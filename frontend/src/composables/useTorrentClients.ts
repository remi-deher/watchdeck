import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { filterClients, torrentFacets } from '@/downloads/clientFilters';
import { ouvrirFiche } from './useMediaOverlay';
import { readPreference, usePreference, writePreference } from './usePreference';
import { useDownloadSources } from './useDownloadSources';
import { useTorrentActions } from './useTorrentActions';
import { useToast } from './useToast';

const asList = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asArray = (value: string | string[]): string[] => (Array.isArray(value) ? value : value ? [value] : []);
const isSet = (value: unknown): boolean => (Array.isArray(value) ? value.length > 0 : Boolean(value));

/**
 * Les torrents des clients : la liste, ses filtres (retenus par client), ses facettes et ce
 * qu'on en fait. `run(clé, torrents)` décode les clés de `torrentDefinitions`.
 */
export function useTorrentClients() {
  const route = useRoute();
  const router = useRouter();
  const { addToast } = useToast();

  /* Le client choisi vit dans l'adresse : un lien y mène directement. */
  const clientId = computed(() => (route.query.client ? String(route.query.client) : ''));

  const { downloadClients: configured, loading: configurationLoading, load: loadSources } = useDownloadSources();
  onMounted(() => { void loadSources(); });
  const enabledClients = computed(() => configured.value.filter((client: any) => client.enabled));

  const clientsQuery = useQuery({
    queryKey: ['downloads', 'clients'] as const,
    queryFn: ({ signal }) => api('/api/downloads/clients', { signal }),
    select: (rows) => asList<any>(rows),
    staleTime: 5_000,
  });
  const torrents = computed<any[]>(() => clientsQuery.data.value || []);
  // Une surveillance *arr n'apporte rien aux clients torrent : on ne relit que pour le reste.
  useRealtime(['download.updated'], (_type, detail: any) => {
    if (!['sonarr-queue-monitor', 'radarr-queue-monitor'].includes(detail?.job || '')) void clientsQuery.refetch({ cancelRefetch: true });
  }, { debounceMs: 350 });

  /* ---- Filtres, retenus par client ---- */
  const query = ref('');
  const status = ref<string | string[]>([]);
  const category = ref<string | string[]>([]);
  const tracker = ref<string | string[]>([]);
  const ownership = ref('');
  function reset(): void {
    query.value = ''; status.value = []; category.value = []; tracker.value = []; ownership.value = '';
  }
  const storageKey = () => `torrent-filters:${clientId.value || 'all'}`;
  function restore(): void {
    try {
      const saved = readPreference<any>(storageKey(), null);
      if (!saved) { reset(); return; }
      query.value = saved.query || '';
      status.value = saved.status || [];
      category.value = saved.category || [];
      tracker.value = saved.tracker || [];
      ownership.value = saved.ownership || '';
    } catch { reset(); }
  }
  restore();
  watch(clientId, restore);
  watch([query, status, category, tracker, ownership], () => {
    writePreference(storageKey(), { query: query.value, status: status.value, category: category.value, ownership: ownership.value, tracker: tracker.value });
  }, { deep: true });
  /* Les filtres du panneau comptent sur le bouton ; la recherche est visible à côté. */
  const filterCount = computed(() => [status.value, category.value, tracker.value, ownership.value].filter(isSet).length);

  // Les compteurs portent sur tous les torrents, avant filtrage.
  const facets = computed(() => torrentFacets(torrents.value));
  const rows = computed(() => filterClients(torrents.value, {
    query: query.value, clientId: clientId.value, category: category.value, status: status.value, tracker: tracker.value, ownership: ownership.value,
  }));
  const scoped = computed(() => torrents.value.filter((row: any) => !row.client_error && (!clientId.value || String(row.client_id) === clientId.value)));

  const clientName = computed(() => configured.value.find((client: any) => String(client.id) === clientId.value)?.name
    || torrents.value.find((row: any) => String(row.client_id) === clientId.value)?.client_name
    || '');
  function selectClient(name: string): void {
    const found = configured.value.find((client: any) => client.name === name);
    const next: Record<string, any> = { ...route.query };
    if (found) next.client = String(found.id); else delete next.client;
    void router.replace({ path: '/downloads', query: next });
  }

  /* ---- Bandeaux : données en cache, client injoignable ---- */
  const stale = computed(() => torrents.value.find((row: any) => row.is_stale) || null);
  const clientErrors = computed(() => torrents.value.filter((row: any) => row.client_error && (!clientId.value || String(row.client_id) === clientId.value)));

  /* ---- Affichage retenu ---- */
  const compact = usePreference('torrent-table-compact', false, { legacyKeys: ['watchdeck:torrent-table-compact'] });
  const incognito = usePreference('torrent-table-incognito', false, { legacyKeys: ['watchdeck:torrent-table-incognito'] });

  /* ---- Actions ---- */
  const metaTargets = ref<any[] | null>(null);
  const { busy, isBusy, runAction, saveMetadata } = useTorrentActions({
    onDone: () => { void clientsQuery.refetch({ cancelRefetch: true }); },
    onError: (message) => addToast({ type: 'error', message }),
    askConfirm: async () => true,
  });
  const openDetails = (row: any) => ouvrirFiche(router, `/downloads/torrent/${encodeURIComponent(row.client_id)}/${encodeURIComponent(row.hash)}`, route.fullPath);

  /** Une action des définitions, sur les torrents visés (la confirmation est déjà donnée). */
  function run(key: string, targets: any[]): void {
    if (key === 'details') openDetails(targets[0]);
    else if (key === 'meta') metaTargets.value = targets;
    else if (key === 'remove') void runAction('delete', targets, false);
    else if (key === 'remove-files') void runAction('delete', targets, true);
    else if (key === 'compact') compact.value = !compact.value;
    else if (key === 'incognito') incognito.value = !incognito.value;
    else void runAction(key, targets);
  }
  async function saveMeta(category: string, tags: string): Promise<void> {
    const count = metaTargets.value?.length || 0;
    await saveMetadata(metaTargets.value || [], category, tags);
    metaTargets.value = null;
    addToast({ type: 'success', message: count > 1 ? `Classement enregistré pour ${count} torrents.` : 'Classement enregistré.' });
  }

  return {
    clientId, clientName, selectClient, configured, enabledClients, configurationLoading,
    torrents, rows, scoped, pending: computed(() => clientsQuery.isPending.value),
    error: computed(() => (clientsQuery.error.value ? `Clients torrent : ${(clientsQuery.error.value as Error).message}` : '')),
    reload: () => clientsQuery.refetch({ cancelRefetch: true }),
    query, status, category, tracker, ownership, reset, filterCount, facets, asArray,
    stale, clientErrors, compact, incognito, isBusy, busy,
    metaTargets, saveMeta, run, openDetails,
  };
}
