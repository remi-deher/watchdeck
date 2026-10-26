/* Options d'une demande de media : pour qui, dans quel dossier, quelles saisons. La page garde
   ses reponses (demandeur, dossier, saisons) ; la definition les lit a l'ouverture et les lui
   rend par `onConfirm`. */
import type { CreateDefinition } from '@/components/templates/create/types';

export interface RequestOptionsValues { plexUserId: string; rootFolder: string; seasons: number[] }

export interface RequestOptionsForm {
  mediaTitle: string;
  mediaType: string;
  confirmLabel: string;
  requesters: any[];
  folders: any[];
  seasonNumbers: number[];
  initial: () => RequestOptionsValues;
  onConfirm: (values: RequestOptionsValues) => void;
}

export function requestOptionsForm(form: RequestOptionsForm): CreateDefinition {
  const isShow = form.mediaType === 'show';
  const chooseSeasons = isShow && form.seasonNumbers.length > 0;
  return {
    size: 'sm',
    noun: 'une demande',
    another: 'une autre demande',
    editTitle: 'Options de la demande',
    subtitle: form.mediaTitle,
    submitLabel: form.confirmLabel,
    quick: true,
    initial: () => {
      const start = form.initial();
      return { plexUserId: start.plexUserId, rootFolder: start.rootFolder, seasons: start.seasons.map(String) };
    },
    steps: [{
      key: 'options',
      label: 'Options',
      title: isShow ? 'Choisir les saisons' : 'Confirmer le film',
      description: isShow ? 'La demande portera sur les saisons sélectionnées.' : 'La recherche démarrera automatiquement après confirmation.',
      fields: [
        {
          key: 'plexUserId',
          type: 'select',
          label: 'Demandeur',
          options: form.requesters.map((user) => ({ value: String(user.plex_user_id), label: String(user.custom_name || user.display_name || user.plex_user_id) })),
          when: () => form.requesters.length > 0,
          validate: (value) => (value ? undefined : 'Choisissez un demandeur.'),
        },
        {
          key: 'rootFolder',
          type: 'select',
          label: 'Dossier racine',
          options: [{ value: '', label: 'Dossier par défaut' }, ...form.folders.map((folder) => ({ value: String(folder.path || folder), label: String(folder.path || folder) }))],
          when: () => form.folders.length > 0,
        },
        {
          key: 'seasons',
          type: 'checklist',
          label: 'Saisons à demander',
          help: 'Les épisodes spéciaux (saison 0) ne sont pas sélectionnés par défaut.',
          options: form.seasonNumbers.map((season) => ({ value: String(season), label: `Saison ${season}` })),
          when: () => chooseSeasons,
          validate: (value) => (Array.isArray(value) && value.length ? undefined : 'Choisissez au moins une saison.'),
        },
      ],
    }],
    submit: async (values) => {
      form.onConfirm({
        plexUserId: String(values.plexUserId ?? ''),
        rootFolder: String(values.rootFolder ?? ''),
        seasons: (values.seasons as string[] | undefined ?? []).map(Number).filter((season) => season > 0).sort((a, b) => a - b),
      });
      return { message: '' };
    },
  };
}
