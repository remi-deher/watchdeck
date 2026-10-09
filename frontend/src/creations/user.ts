/* Creer : un utilisateur, rattache a son compte Plex. */
import { api } from '@/api';
import type { CreateDefinition } from '@/components/templates/create/types';

const ROLES = [
  { value: 'user', label: 'Utilisateur', description: 'Demande des médias et suit ses demandes.' },
  { value: 'moderator', label: 'Modérateur', description: 'Approuve les demandes des autres.' },
  { value: 'admin', label: 'Administrateur', description: 'Accède à tous les réglages.' },
];

export const userCreation: CreateDefinition = {
  noun: 'un utilisateur',
  another: 'un autre utilisateur',
  initial: () => ({ plex_user_id: '', display_name: '', plex_email: '', role: 'user', notify_on_available: true }),
  steps: [
    {
      key: 'identity',
      label: 'Identité',
      title: 'Qui ajoutez-vous ?',
      fields: [
        { key: 'display_name', type: 'text', label: 'Nom affiché', placeholder: 'Camille', required: true },
        { key: 'plex_user_id', type: 'text', label: 'Identifiant Plex', help: 'Le nom d’utilisateur ou l’identifiant du compte Plex.', required: true },
        { key: 'plex_email', type: 'email', label: 'Email', help: 'Pour les notifications ; facultatif.' },
      ],
    },
    {
      key: 'rights',
      label: 'Droits',
      title: 'Que peut-il faire ?',
      fields: [
        { key: 'role', type: 'cards', label: 'Rôle', options: ROLES, required: true },
        { key: 'notify_on_available', type: 'toggle', label: 'Prévenir quand une demande est disponible' },
      ],
    },
  ],
  submit: async (values) => {
    const user = await api<{ id: number }>('/api/users', { method: 'POST', body: JSON.stringify(values) });
    return {
      message: `${values.display_name} a été ajouté`,
      detail: 'Il peut se connecter avec son compte Plex.',
      links: [{ label: 'Voir sa fiche', to: `/users/${user.id}` }],
    };
  },
};
