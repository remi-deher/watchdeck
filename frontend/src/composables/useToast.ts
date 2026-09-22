import type { ToastMessageOptions } from 'primevue/toast';
import type { ToastServiceMethods } from 'primevue/toastservice';

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

export interface AppToastData {
  id: number;
  image: string | null;
  action: ToastAction | null;
}

export type AppToastMessage = ToastMessageOptions & { data: AppToastData };

const pending: AppToastMessage[] = [];
const displayed = new Map<number, AppToastMessage>();
let service: ToastServiceMethods | null = null;
let nextId = 1;

/** Relie l'API applicative au service PrimeVue lorsque le composant global est monte. */
export function registerToastService(nextService: ToastServiceMethods): void {
  service = nextService;
  for (const message of pending.splice(0)) {
    displayed.set(message.data.id, message);
    service.add(message);
  }
}

export function unregisterToastService(currentService: ToastServiceMethods): void {
  if (service === currentService) service = null;
}

export function forgetToast(id: number): void {
  displayed.delete(id);
}

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
    const toast: AppToastMessage = {
      severity: type === 'warning' ? 'warn' : type,
      summary: title,
      detail: message,
      group: 'app',
      closable: true,
      data: { id, image, action },
      ...(duration > 0 ? { life: duration } : {}),
    };

    if (service) {
      displayed.set(id, toast);
      service.add(toast);
    } else {
      pending.push(toast);
    }
    return id;
  }

  function dismissToast(id: number): void {
    const waitingIndex = pending.findIndex((toast) => toast.data.id === id);
    if (waitingIndex !== -1) pending.splice(waitingIndex, 1);

    const toast = displayed.get(id);
    if (toast && service) service.remove(toast);
    displayed.delete(id);
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
