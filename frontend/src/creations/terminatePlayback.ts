/* Arreter une lecture : le message que l'utilisateur lira sur son ecran, avec une formulation
   par defaut polie. Arreter coupe quelqu'un en plein film, d'ou la saisie avant l'action. */
import { api } from '@/api';
import type { CreateDefinition } from '@/components/templates/create/types';

const DEFAULT_TERMINATE_REASON = 'La lecture a été arrêtée par l’administrateur du serveur.';
const MAX_REASON_LENGTH = 300;

export function terminatePlaybackForm(sessionId: number | string, subtitle = ''): CreateDefinition {
  return {
    noun: 'la lecture',
    another: 'une autre lecture',
    editTitle: 'Arrêter la lecture',
    subtitle,
    submitLabel: 'Arrêter la lecture',
    quick: true,
    initial: () => ({ reason: DEFAULT_TERMINATE_REASON }),
    steps: [{
      key: 'reason',
      label: 'Message',
      title: 'Que verra l’utilisateur ?',
      fields: [{
        key: 'reason',
        type: 'textarea',
        label: 'Message affiché sur le lecteur',
        help: 'Plex l’affiche à l’utilisateur au moment de l’arrêt.',
        rows: 3,
        validate: (value) => (String(value ?? '').length > MAX_REASON_LENGTH ? `${MAX_REASON_LENGTH} caractères au plus.` : undefined),
      }],
    }],
    submit: async (values) => {
      await api(`/api/playback/sessions/${encodeURIComponent(String(sessionId))}/terminate`, {
        method: 'POST',
        body: JSON.stringify({ reason: values.reason }),
      });
      return { message: 'Lecture arrêtée' };
    },
  };
}
