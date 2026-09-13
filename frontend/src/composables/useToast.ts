import { ref, type Ref } from 'vue';

/** Bouton facultatif porte par la notification (« Annuler », « Reessayer »…). */
export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastItem {
  id: number;
  title: string;
  message?: string;
  type: 'info' | 'success' | 'error' | 'warning';
  image?: string | null;
  action?: ToastAction | null;
}

export interface AddToastOptions {
  title?: string;
  message?: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
  image?: string | null;
  action?: ToastAction | null;
}

const toasts = ref<ToastItem[]>([]);
let nextId = 1;

export function useToast() {
  function addToast({
    title = '',
    message = '',
    type = 'info',
    duration = 4000,
    image = null,
    action = null,
  }: AddToastOptions = {}): number {
    const id = nextId++;
    const toast: ToastItem = { id, title, message, type, image, action };
    toasts.value.push(toast);

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }
    return id;
  }

  function dismissToast(id: number): void {
    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx !== -1) {
      toasts.value.splice(idx, 1);
    }
  }

  function success(title: string, message = ''): number {
    return addToast({ title, message, type: 'success' });
  }

  function error(title: string, message = ''): number {
    return addToast({ title, message, type: 'error' });
  }

  function info(title: string, message = ''): number {
    return addToast({ title, message, type: 'info' });
  }

  /**
   * Notification porteuse d'un retour arriere.
   *
   * Aucune action de l'application n'etait annulable : une fois la confirmation
   * validee, il n'y avait plus de recours. La fenetre est volontairement plus longue
   * qu'une notification ordinaire -- il faut lire, comprendre qu'on s'est trompe, puis
   * viser le bouton.
   */
  function undoable(title: string, label: string, run: () => void | Promise<void>, message = ''): number {
    return addToast({ title, message, type: 'success', duration: 8000, action: { label, run } });
  }

  return {
    toasts,
    addToast,
    dismissToast,
    success,
    error,
    info,
    undoable,
  };
}
