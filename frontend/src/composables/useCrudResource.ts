import { reactive, ref, type Ref } from 'vue';
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

  const items = ref<T[]>([]) as Ref<T[]>;
  const editingId = ref<any>(null);
  const showModal = ref(false);
  const busy = ref(false);
  const form = reactive<Record<string, any>>({ ...defaults });

  async function load(): Promise<void> {
    items.value = await api<T[]>(basePath);
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
    busy.value = true;
    try {
      const editing = editingId.value;
      await api(editing ? `${basePath}/${editing}` : basePath, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      });
      success(editing ? updated : created);
      showModal.value = false;
      reset();
      await load();
    } catch (error) {
      fail(error);
    } finally {
      busy.value = false;
    }
  }

  async function toggle(item: T): Promise<void> {
    await api(`${basePath}/${item.id}/toggle`, { method: 'PATCH' });
    await load();
  }

  async function remove(item: T, askConfirm: (options: any) => Promise<boolean>): Promise<void> {
    const confirmed = await askConfirm({
      title: confirmTitle,
      message: confirmMessage(item.name || ''),
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!confirmed) return;
    await api(`${basePath}/${item.id}`, { method: 'DELETE' });
    await load();
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
