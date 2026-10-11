import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import { buildIndexerHealth, type IndexerRow } from '@/downloads/indexerHealth';

/** Sante des indexeurs d'une instance Prowlarr, sur une periode : donnees de la page Surveiller. */
export function useIndexerHealth() {
  const route = useRoute();
  const instanceId = computed(() => String(route.params.instanceId || ''));
  const days = ref(7);

  const query = useQuery({
    queryKey: computed(() => ['downloads', 'indexer-health', instanceId.value, days.value]),
    queryFn: ({ signal }) => api<any>(`/api/prowlarr/${instanceId.value}/indexer-health?days=${days.value}`, { signal }),
    enabled: computed(() => Boolean(instanceId.value)),
    staleTime: 60_000,
    // Les donnees se rafraichissent seules : la page n'a pas de bouton d'actualisation.
    refetchInterval: 60_000,
  });
  const data = computed(() => query.data.value || null);
  const rows = computed<IndexerRow[]>(() => data.value?.indexers || []);
  const health = computed(() => buildIndexerHealth(rows.value, days.value));
  const title = computed(() => (data.value?.instance?.name ? `Indexeurs · ${data.value.instance.name}` : 'Santé des indexeurs'));
  const error = computed(() => {
    if (query.isError.value) return humanizeError(query.error.value);
    if (data.value && !data.value.connected) return 'Prowlarr ne répond pas : vérifiez l’instance dans Connexions.';
    return '';
  });
  return { days, rows, kpis: computed(() => health.value.kpis), items: computed(() => health.value.items), title, error, pending: query.isPending, reload: () => query.refetch() };
}
