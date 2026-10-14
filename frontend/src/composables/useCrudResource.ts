import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';

export interface CrudResourceMessages {
  confirmTitle?: string;
  confirmMessage?: (name: string) => string;
}

/* La liste d'une ressource REST (`basePath`) et ses actions de ligne : activer / desactiver
   et supprimer. La saisie (ajout, modification) passe par une definition du gabarit Creer. */
export function useCrudResource<T extends { id?: any; name?: string } = any>(
  basePath: string,
  messages: CrudResourceMessages = {}
) {
  const {
    confirmTitle = 'Supprimer cet élément ?',
    confirmMessage = (name: string) => `${name} sera supprimé définitivement.`,
  } = messages;

  const queryClient = useQueryClient();
  const queryKey = ['settings', 'crud', basePath] as const;
  const listQuery = useQuery({
    queryKey,
    queryFn: () => api<T[]>(basePath),
  });
  const items = computed<T[]>(() => listQuery.data.value || []);

  const toggleMutation = useMutation({
    mutationFn: (item: T) => api(`${basePath}/${item.id}/toggle`, { method: 'PATCH' }),
    retry: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const removeMutation = useMutation({
    mutationFn: (item: T) => api(`${basePath}/${item.id}`, { method: 'DELETE' }),
    retry: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const busy = computed(() => toggleMutation.isPending.value || removeMutation.isPending.value);

  async function load(): Promise<void> {
    await listQuery.refetch();
  }

  async function toggle(item: T): Promise<void> {
    await toggleMutation.mutateAsync(item);
  }

  async function remove(item: T, askConfirm: (options: any) => Promise<boolean>): Promise<void> {
    const confirmed = await askConfirm({
      title: confirmTitle,
      message: confirmMessage(item.name || ''),
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!confirmed) return;
    await removeMutation.mutateAsync(item);
  }

  return {
    items,
    loaded: computed(() => listQuery.isSuccess.value),
    busy,
    load,
    toggle,
    remove,
  };
}
