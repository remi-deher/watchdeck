import { computed, onMounted } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { acquisitionOverview } from '@/downloads/acquisitionOverview';
import { diskSpaceQuery } from '@/sharedQueries';
import { humanizeError } from '@/utils/apiError';
import { useDownloadQueue } from './useDownloadQueue';
import { useDownloadSources } from './useDownloadSources';

const asList = (value: unknown): any[] => (Array.isArray(value) ? value : []);

/**
 * Ce que la vue d'ensemble d'Acquisition lit : la file, les gestionnaires et clients
 * configurés, leurs torrents, les disques et l'état des indexeurs. La synthèse
 * (`acquisitionOverview`) en tire indicateurs, points d'attention et zones.
 */
export function useAcquisitionOverview() {
  const queue = useDownloadQueue();
  const sources = useDownloadSources();
  onMounted(() => { void sources.load(); });

  const torrentsQuery = useQuery({
    queryKey: ['downloads', 'clients'] as const,
    queryFn: ({ signal }) => api('/api/downloads/clients', { signal }),
    select: asList,
    staleTime: 5_000,
  });
  const disksQuery = useQuery({ ...diskSpaceQuery(), select: asList });

  const indexers = computed(() => sources.arrInstances.value.filter((instance: any) => instance.arr_type === 'prowlarr' && instance.enabled));
  const prowlarrQuery = useQuery({
    queryKey: computed(() => ['downloads', 'prowlarr-overview', indexers.value.map((instance: any) => instance.id)]),
    queryFn: async ({ signal }) => {
      const results = await Promise.allSettled(indexers.value.map((instance: any) => api(`/api/prowlarr/${instance.id}/overview`, { signal })));
      return Object.fromEntries(indexers.value.map((instance: any, index: number) => [instance.id,
        results[index].status === 'fulfilled' ? (results[index] as PromiseFulfilledResult<any>).value : { connected: false }]));
    },
    enabled: computed(() => indexers.value.length > 0),
  });

  const overview = computed(() => acquisitionOverview({
    queue: queue.rows.value,
    arrInstances: sources.arrInstances.value,
    clients: sources.downloadClients.value,
    torrents: torrentsQuery.data.value || [],
    volumes: disksQuery.data.value || [],
    prowlarr: prowlarrQuery.data.value || {},
  }));
  const pending = computed(() => queue.pending.value && !queue.rows.value.length);
  const error = computed(() => [queue.error.value, sources.error.value, torrentsQuery.error.value ? `Clients torrent : ${humanizeError(torrentsQuery.error.value)}` : ''].filter(Boolean).join(' · '));
  const volumes = computed(() => disksQuery.data.value || []);

  async function reload(): Promise<void> {
    await Promise.allSettled([queue.reload(), sources.load({ force: true }), torrentsQuery.refetch(), disksQuery.refetch()]);
  }

  return { overview, volumes, pending, error, reload };
}
