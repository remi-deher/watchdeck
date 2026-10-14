/* Motif d'un refus ou d'une annulation : choisir un motif de la liste partagee ou ecrire un
   message libre, que lira le demandeur. Les motifs arrivent apres l'ouverture (reglages), d'ou
   les fonctions : la definition est faite une fois, ce qu'elle lit reste a jour. */
import type { CreateDefinition } from '@/components/templates/create/types';

export interface PickableReason { id: number; label: string; message: string }

const FREE = 'free';

export interface ReasonPickerOptions {
  title: string;
  subtitle: string;
  confirmLabel: string;
  placeholder: string;
  reasons: () => PickableReason[];
  initial: () => string;
  onConfirm: (message: string) => void;
}

export function reasonPickerForm(options: ReasonPickerOptions): CreateDefinition {
  return {
    noun: 'un motif',
    another: 'un autre motif',
    editTitle: options.title,
    get subtitle() { return options.subtitle; },
    submitLabel: options.confirmLabel,
    quick: true,
    initial: () => ({ reason: FREE, message: options.initial() }),
    steps: [{
      key: 'reason',
      label: 'Motif',
      title: 'Que dit-on au demandeur ?',
      fields: [
        {
          key: 'reason',
          type: 'select',
          label: 'Motif',
          options: () => [...options.reasons().map((reason) => ({ value: String(reason.id), label: reason.label })), { value: FREE, label: 'Message libre' }],
          when: () => options.reasons().length > 0,
          onChange: (value, values) => {
            const picked = options.reasons().find((reason) => String(reason.id) === value);
            if (picked) values.message = picked.message;
          },
        },
        {
          key: 'message',
          type: 'textarea',
          label: 'Message envoyé au demandeur',
          help: 'Laissé vide, l’annulation part sans explication.',
          placeholder: options.placeholder,
          rows: 5,
        },
      ],
    }],
    submit: async (values) => {
      options.onConfirm(String(values.message ?? '').trim());
      return { message: '' };
    },
  };
}
