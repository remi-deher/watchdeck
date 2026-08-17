import { ref, type Ref } from 'vue';

export interface ToastItem {
  id: number;
  title: string;
  message?: string;
  type: 'info' | 'success' | 'error' | 'warning';
  image?: string | null;
}

export interface AddToastOptions {
  title?: string;
  message?: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
  image?: string | null;
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
  }: AddToastOptions = {}): number {
    const id = nextId++;
    const toast: ToastItem = { id, title, message, type, image };
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

  return {
    toasts,
    addToast,
    dismissToast,
    success,
    error,
    info,
  };
}
