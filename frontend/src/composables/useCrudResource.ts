import { computed, reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { fail, success } from '@/settingsForm';

export interface CrudResourceMessages {
  created?: string;
  updated?: string;
  confirmTitle?: string;
  confirmMessage?: (name: string) => string;
}

export function useCrudResource<T extends { id?: any; name?: string } = any>(
  basePath: string,
  defaults: Partial<T> | Record<string, any>,
  messages: CrudResourceMessages = {}
) {
  const {
    created = 'Enregistré.',
    updated = created,
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
  const editingId = ref<any>(null);
  const showModal = ref(false);
  const form = reactive<Record<string, any>>({ ...defaults });

  const saveMutation = useMutation({
    mutationFn: ({ editing, payload }: { editing: any; payload: Record<string, any> }) => api(
      editing ? `${basePath}/${editing}` : basePath,
      { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) },
    ),
    retry: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
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
  const busy = computed(() => saveMutation.isPending.value || toggleMutation.isPending.value || removeMutation.isPending.value);

  async function load(): Promise<void> {
    await listQuery.refetch();
  }

  function reset(): void {
    editingId.value = null;
    for (const key of Object.keys(form)) {
      if (!(key in defaults)) delete form[key];
    }
    Object.assign(form, defaults);
  }

  function openModal(item?: T | null): void {
    reset();
    if (item) {
      editingId.value = item.id;
      Object.assign(form, defaults, item);
    }
    showModal.value = true;
  }

  function closeModal(): void {
    showModal.value = false;
    reset();
  }

  async function save(): Promise<void> {
    try {
      const editing = editingId.value;
      await saveMutation.mutateAsync({ editing, payload: { ...form } });
      success(editing ? updated : created);
      showModal.value = false;
      reset();
    } catch (error) {
      fail(error);
    }
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
    editingId,
    showModal,
    busy,
    form,
    load,
    reset,
    openModal,
    closeModal,
    save,
    toggle,
    remove,
  };
}
