import { ref, type Ref } from 'vue';

export interface ConfirmDialogOptions {
  open?: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Ce que l'action touche : les comptes, les médias… (les cinq premiers sont nommés). */
  items?: ConfirmItem[];
  /** Texte à taper pour débloquer le bouton : réservé aux actions en masse et irréversibles. */
  typeToConfirm?: string;
}

export interface ConfirmItem {
  key: string | number;
  label: string;
  detail?: string;
}

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  items: ConfirmItem[];
  typeToConfirm: string;
}

export function useConfirm() {
  const dialog = ref<ConfirmDialogState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmer',
    danger: false,
    items: [],
    typeToConfirm: '',
  });
  let resolver: ((value: boolean) => void) | null = null;

  function askConfirm(options: ConfirmDialogOptions = {}): Promise<boolean> {
    dialog.value = {
      open: true,
      title: 'Confirmer l’action',
      message: '',
      confirmLabel: 'Confirmer',
      danger: false,
      items: [],
      typeToConfirm: '',
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
