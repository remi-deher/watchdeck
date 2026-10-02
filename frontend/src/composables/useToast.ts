import { shallowRef } from 'vue';

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface AddToastOptions {
  title?: string;
  message?: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
  image?: string | null;
  action?: ToastAction | null;
}

export interface AppToastMessage {
  id: number;
  title: string;
  message: string;
  type: NonNullable<AddToastOptions['type']>;
  /** En millisecondes ; 0 = reste affiche jusqu'a sa fermeture. */
  duration: number;
  image: string | null;
  action: ToastAction | null;
}

/* La file des notifications, lue par `AppToast` (Reka UI). Une simple liste reactive :
   plus de service PrimeVue a enregistrer, ni de file d'attente pour les notifications
   emises avant son montage. */
export const toasts = shallowRef<AppToastMessage[]>([]);
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
    toasts.value = [...toasts.value, { id, title, message, type, duration, image, action }];
    return id;
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
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

  function undoable(title: string, label: string, run: () => void | Promise<void>, message = ''): number {
    return addToast({ title, message, type: 'success', duration: 8000, action: { label, run } });
  }

  return { addToast, dismissToast, removeToast: dismissToast, success, error, info, undoable };
}
