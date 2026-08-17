import { ref, type Ref } from 'vue';

export interface ConfirmDialogOptions {
  open?: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
}

export function useConfirm() {
  const dialog = ref<ConfirmDialogState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmer',
    danger: false,
  });
  let resolver: ((value: boolean) => void) | null = null;

  function askConfirm(options: ConfirmDialogOptions = {}): Promise<boolean> {
    dialog.value = {
      open: true,
      title: 'Confirmer l’action',
      message: '',
      confirmLabel: 'Confirmer',
      danger: false,
      ...options,
    };
    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  function resolveConfirm(value: boolean): void {
    dialog.value = { ...dialog.value, open: false };
    if (resolver) resolver(value);
    resolver = null;
  }

  return { dialog, askConfirm, resolveConfirm };
}
