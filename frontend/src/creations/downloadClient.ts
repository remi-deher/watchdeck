/* Creer : un client de telechargement (qBittorrent, Transmission, dossier surveille).
   La meme definition sert a la modification (`id`) : valeurs actuelles, mot de passe vide = conserve. */
import { api } from '@/api';
import type { CreateDefinition } from '@/components/templates/create/types';

const CLIENTS = [
  { value: 'qbittorrent', label: 'qBittorrent', description: 'Client torrent' },
  { value: 'transmission', label: 'Transmission', description: 'Client torrent' },
  { value: 'watch_folder', label: 'Dossier surveillé', description: 'Dépose des .torrent' },
];
const labelOf = (type: string) => CLIENTS.find((c) => c.value === type)?.label || 'client';

export const DOWNLOAD_CLIENT_DEFAULTS = {
  name: '', client_type: 'qbittorrent', url: '', username: '', password: '', category: '', tags: '', is_default: false, enabled: true,
};

/** `id` : le client modifie ; absent, un nouveau. `done` previent la liste (relecture, notification). */
export function downloadClientCreation(id: number | string | null, done: (message: string) => void): CreateDefinition {
  return {
    noun: 'un client',
    another: 'un autre client',
    editTitle: 'Modifier le client',
    quick: Boolean(id),
    initial: () => ({ ...DOWNLOAD_CLIENT_DEFAULTS }),
    steps: [
      {
        key: 'client',
        label: 'Client',
        title: 'Quel client voulez-vous brancher ?',
        fields: [{ key: 'client_type', type: 'cards', label: 'Client', options: CLIENTS, required: true }],
      },
      {
        key: 'connection',
        label: 'Connexion',
        title: (values) => `Où se trouve votre ${labelOf(values.client_type)} ?`,
        fields: [
          { key: 'name', type: 'text', label: 'Nom', help: 'Pour le reconnaître dans Watchdeck.', placeholder: 'qBittorrent', required: true },
          { key: 'url', type: 'url', label: 'Adresse', help: 'Adresse complète, avec le port, ou dossier à surveiller.', required: true },
          { key: 'username', type: 'text', label: 'Utilisateur (facultatif)', help: 'Laisser vide si le client autorise Watchdeck par adresse IP ou sous-réseau.' },
          {
            key: 'password', type: 'secret', label: 'Mot de passe (facultatif)',
            help: id ? 'Enregistré : laisser vide pour le garder.' : undefined,
            summary: 'hide',
          },
        ],
      },
      {
        key: 'sending',
        label: 'Envoi',
        title: 'Comment ranger les torrents envoyés ?',
        fields: [
          { key: 'category', type: 'text', label: 'Catégorie', help: 'Appliquée aux torrents envoyés, pour les retrouver dans le client.' },
          { key: 'tags', type: 'text', label: 'Tags', help: 'Séparés par des virgules, appliqués aux torrents envoyés depuis Watchdeck.' },
          { key: 'is_default', type: 'toggle', label: 'Client par défaut' },
          {
            key: 'default_note', type: 'note',
            text: 'Présélectionné quand plusieurs clients sont configurés et qu’aucun n’est choisi lors d’un envoi manuel.',
            label: '',
          },
        ],
      },
    ],
    test: {
      step: 'connection',
      fields: ['url', 'username', 'password', 'client_type'],
      run: async (values) => {
        const data = await api<{ success: boolean; message?: string }>('/api/test/download-client', {
          method: 'POST',
          body: JSON.stringify({ ...values, id: id ?? undefined }),
        });
        return { ok: Boolean(data.success), message: data.message || (data.success ? 'Client joignable.' : 'Connexion impossible.') };
      },
    },
    submit: async (values) => {
      const { has_password, ...payload } = values;
      await api(id ? `/api/download-clients/${id}` : '/api/download-clients', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      const message = id ? 'Client mis à jour.' : 'Client ajouté.';
      done(message);
      return {
        message: `${labelOf(values.client_type)} « ${values.name} » ${id ? 'mis à jour' : 'branché'}`,
        links: [{ label: 'Voir les clients', to: '/settings/acquisition' }],
      };
    },
  };
}
