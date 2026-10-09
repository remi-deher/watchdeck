/* Modifier une bibliotheque FileFlows : son flow, sa correspondance avec un dossier Plex
   (utilisee par la pause pendant les lectures) et sa place dans l'alternance. La liste des
   flows et des dossiers Plex vient de la page, d'ou la fabrique. */
import { api } from '@/api';
import type { CreateDefinition } from '@/components/templates/create/types';

export const PLEX_AUTO = '__auto__';
export const PLEX_NONE = '__none__';

export interface FileflowsLibraryContext {
  flows: Array<{ uid: string; name: string }>;
  plexLocations: Array<{ server: string; library: string; path: string }>;
  /** Dossier propose automatiquement pour cette bibliotheque. */
  suggested: string | null;
}

export function fileflowsLibraryEdit(uid: string, name: string, context: FileflowsLibraryContext): CreateDefinition {
  return {
    noun: 'une bibliothèque',
    another: 'une autre bibliothèque',
    editTitle: `Modifier « ${name} »`,
    initial: () => ({ flow_uid: '', plex: PLEX_AUTO, reorder: false }),
    steps: [
      {
        key: 'library',
        label: 'Bibliothèque',
        title: 'Comment traiter cette bibliothèque ?',
        fields: [
          {
            key: 'flow_uid', type: 'select', label: 'Flow', required: true,
            help: 'Les prochains fichiers seront traités par ce flow ; ceux déjà traités ne sont pas repris.',
            options: context.flows.map((flow) => ({ value: flow.uid, label: flow.name })),
          },
          {
            key: 'plex', type: 'select', label: 'Dossier Plex correspondant',
            help: 'Sert à mettre ce disque en pause pendant une lecture Plex.',
            options: [
              { value: PLEX_AUTO, label: context.suggested ? `Automatique (${context.suggested})` : 'Automatique (aucune proposition)' },
              { value: PLEX_NONE, label: 'Aucun : pas de pause pour cette bibliothèque' },
              ...context.plexLocations.map((loc) => ({ value: loc.path, label: `${loc.library} · ${loc.path}` })),
            ],
          },
          { key: 'reorder', type: 'toggle', label: 'Inclure dans l’alternance par disque' },
        ],
      },
    ],
    submit: async (values) => {
      await api(`/api/fileflows/libraries/${uid}`, { method: 'PATCH', body: JSON.stringify({ flow_uid: values.flow_uid, reorder: values.reorder }) });
      await api(`/api/fileflows/libraries/${uid}/plex-location`, {
        method: 'PUT',
        body: JSON.stringify({ path: values.plex === PLEX_AUTO ? null : values.plex === PLEX_NONE ? '' : values.plex }),
      });
      return { message: `« ${name} » mise à jour` };
    },
  };
}
