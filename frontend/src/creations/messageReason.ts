/* Motifs de message : un motif d'annulation ou de correction que l'administrateur choisit au lieu de
   se ressaisir. Une definition pour l'ajout comme pour la modification ; ce qui est enregistre
   vient de la page, d'ou la fabrique. */
import type { CreateDefinition } from '@/components/templates/create/types';

export interface MessageReasonDraft { label: string; message: string; enabled: boolean }

export function messageReasonForm(event: string, eventLabel: string, save: (draft: MessageReasonDraft) => Promise<void>): CreateDefinition {
  return {
    noun: 'un motif',
    another: 'un autre motif',
    editTitle: 'Modifier le motif',
    subtitle: eventLabel,
    submitLabel: 'Enregistrer',
    quick: true,
    initial: () => ({ label: '', message: '', enabled: true }),
    steps: [{
      key: 'reason',
      label: 'Motif',
      title: 'Que dit ce motif ?',
      fields: [
        { key: 'label', type: 'text', label: 'Libellé', help: 'Ce que voit l’administrateur pour choisir.', required: true },
        { key: 'message', type: 'textarea', label: 'Message envoyé', help: 'Ce que lit le demandeur.', rows: 4, required: true },
        { key: 'enabled', type: 'toggle', label: 'Proposer ce motif' },
        {
          key: 'preview',
          type: 'note',
          label: 'Aperçu',
          text: (values) => `${event === 'cancelled' ? 'Votre demande « Dune » a été annulée' : 'Une correction a été apportée à « Dune »'} — ${String(values.message || '…').trim() || '…'}`,
        },
      ],
    }],
    submit: async (values) => {
      await save({ label: String(values.label).trim(), message: String(values.message).trim(), enabled: Boolean(values.enabled) });
      return { message: 'Motif enregistré' };
    },
  };
}
