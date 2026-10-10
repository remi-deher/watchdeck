import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { queryKeys } from '@/queryKeys';
import { downloadsGlobalStatsPath } from '@/sharedQueries';
import { humanizeError } from '@/utils/apiError';
import { useToast } from './useToast';

/**
 * Les débits globaux des clients torrent, leur état de connexion et le mode de vitesse
 * alternatif. Même clé que la synthèse : les deux lectures partagent le cache.
 */
export function useTorrentSpeeds(clientId: MaybeRefOrGetter<string | number | null | undefined>) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const statsKey = computed(() => queryKeys.downloads.globalStats(toValue(clientId)));
  const query = useQuery({
    queryKey: statsKey,
    queryFn: ({ signal }) => api<any>(downloadsGlobalStatsPath(toValue(clientId)), { signal }),
    retry: 0,
  });
  const stats = computed(() => query.data.value || {});
  /* En échec : débits à zéro et client(s) hors ligne, sans perdre le nombre de clients déjà
     connu de la vue « tous les clients ». */
  const failed = computed(() => Boolean(query.error.value));
  const downloadSpeed = computed(() => (failed.value ? 0 : Number(stats.value.download_speed || 0)));
  const uploadSpeed = computed(() => (failed.value ? 0 : Number(stats.value.upload_speed || 0)));
  const altSpeed = computed(() => Boolean(stats.value.alt_speed_enabled));
  const connected = computed(() => (failed.value ? 0 : Number(stats.value.connected || 0)));
  const total = computed(() => (failed.value && toValue(clientId) ? 1 : Number(stats.value.total || 0)));
  const connection = computed<{ tone: 'neutral' | 'success' | 'warning' | 'danger'; label: string }>(() => {
    if (total.value === 0) return { tone: 'neutral', label: 'Aucun client' };
    if (total.value === 1) return connected.value ? { tone: 'success', label: 'Connecté' } : { tone: 'danger', label: 'Hors ligne' };
    return {
      tone: connected.value === total.value ? 'success' : connected.value > 0 ? 'warning' : 'danger',
      label: `${connected.value}/${total.value} connectés`,
    };
  });

  const altSpeedMutation = useMutation({
    mutationFn: () => api<{ ok?: boolean }>('/api/downloads/global-alt-speed', { method: 'POST' }),
    retry: 0,
    onSuccess: (result) => {
      if (!result?.ok) return;
      queryClient.setQueryData(statsKey.value, (data: any) => ({ ...(data || {}), alt_speed_enabled: !altSpeed.value }));
      addToast({ type: 'success', message: altSpeed.value ? 'Mode alternatif activé.' : 'Mode alternatif désactivé.' });
    },
    onError: (error) => addToast({ type: 'error', message: `Impossible de modifier le mode vitesse alternative : ${humanizeError(error)}` }),
  });

  return {
    downloadSpeed, uploadSpeed, altSpeed, connection,
    toggleAltSpeed: () => altSpeedMutation.mutate(),
    /** Relit les débits (après un rafraîchissement des torrents). */
    refresh: () => queryClient.invalidateQueries({ queryKey: statsKey.value }),
  };
}
