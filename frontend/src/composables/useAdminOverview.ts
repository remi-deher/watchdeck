import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { queryKeys } from '@/queryKeys';
import type { AdminOverview } from '@/adminAttention';

/**
 * Chiffres d'activité de l'instance (`GET /api/admin/overview`) : demandes à approuver,
 * conflits, notifications, comptes, stockage, cache d'images.
 *
 * Une seule requête partagée par le rail, qui en tire son compteur, et l'aperçu, qui les
 * affiche : le verdict de l'un et la pastille de l'autre ne peuvent pas diverger.
 *
 * Fraîcheur : le serveur n'émet pas d'événement pour les conflits, les signalements ni les
 * comptes. Ces chiffres suivent donc le délai de péremption et le retour sur l'onglet ; les
 * événements qui existent (demandes, notifications, santé, tâches, téléchargements)
 * déclenchent en plus une relecture.
 */
export function useAdminOverview(enabled: MaybeRefOrGetter<boolean>): {
  overview: ComputedRef<AdminOverview | null>;
  loading: ComputedRef<boolean>;
  refresh: () => Promise<void>;
} {
  const active = computed(() => toValue(enabled));
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.admin.overview,
    queryFn: () => api<AdminOverview>('/api/admin/overview'),
    staleTime: 30_000,
    enabled: active,
  });

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.admin.overview });
  };

  // Une rafale d'événements (une synchro de demandes) ne doit relire qu'une fois.
  useRealtime(
    ['request.updated', 'notification.updated', 'health.updated', 'job.updated', 'download.updated'],
    () => { if (active.value) void refresh(); },
    { debounceMs: 1500 },
  );

  return {
    overview: computed(() => {
      const data = query.data.value;
      return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    }),
    loading: computed(() => active.value && query.isPending.value),
    refresh,
  };
}
