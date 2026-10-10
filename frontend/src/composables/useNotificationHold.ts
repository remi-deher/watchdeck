import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { useToast } from './useToast';
import { humanizeError } from '@/utils/apiError';

type AskConfirm = (options: { title: string; message: string; confirmLabel: string }) => Promise<boolean>;

/**
 * La suspension générale des envois automatiques : son état, le nombre de notifications
 * qui attendent, et le changement. Réactiver demande confirmation en disant ce qui partirait.
 */
export function useNotificationHold() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const holdQuery = useQuery({
    queryKey: ['notifications', 'hold'] as const,
    queryFn: ({ signal }) => api<{ enabled?: boolean; pending_count?: number }>('/api/notifications/hold', { signal }),
    staleTime: 15_000,
  });
  const suspended = computed(() => Boolean(holdQuery.data.value?.enabled));
  const pendingCount = computed(() => holdQuery.data.value?.pending_count || 0);

  // Changer la suspension a un effet de bord : jamais de nouvelle tentative automatique.
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => api<{ message?: string }>('/api/notifications/hold', { method: 'PUT', body: JSON.stringify({ enabled }) }),
    retry: 0,
    onSuccess: (data) => {
      queryClient.setQueryData(['notifications', 'hold'], (current: object | undefined) => ({ ...current, ...data }));
    },
  });
  const saving = computed(() => mutation.isPending.value);

  async function toggle(suspend: boolean, askConfirm: AskConfirm): Promise<void> {
    try {
      if (!suspend) {
        const { counts: c } = await api<{ counts: Record<string, number> }>('/api/notifications/resume-preview');
        const accepted = await askConfirm({
          title: 'Réactiver les notifications ?',
          message: `${c.ready} envoi(s) pertinent(s), ${c.old} de plus de 24 h, ${c.obsolete + c.cancelled + c.sent} déjà traité(s) ou devenu(s) inutile(s), ${c.uncertain} sans confirmation. Les notifications déjà en file resteront à examiner et à envoyer explicitement.`,
          confirmLabel: 'Réactiver les nouveaux envois',
        });
        if (!accepted) return;
      }
      const data = await mutation.mutateAsync(suspend);
      addToast({ type: 'success', message: data.message || (suspend ? 'Notifications mises en attente.' : 'Notifications automatiques réactivées.') });
    } catch (failure) {
      addToast({ type: 'error', message: `Le changement n'a pas été enregistré : ${humanizeError(failure)}` });
    }
  }

  return { holdQuery, suspended, pendingCount, saving, toggle };
}
