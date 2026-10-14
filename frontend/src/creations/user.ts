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
  initial: () => ({ account: 'plex', plex_user_id: '', display_name: '', plex_email: '', password: '', role: 'user', notify_on_available: true }),
  steps: [
    {
      key: 'identity',
      label: 'Identité',
      title: 'Qui ajoutez-vous ?',
      fields: [
        {
          key: 'account',
          type: 'cards',
          label: 'Type de compte',
          options: [
            { value: 'plex', label: 'Compte Plex', description: 'Se connecte avec son compte Plex.' },
            { value: 'local', label: 'Compte local', description: 'Identifiant et mot de passe, sans Plex.' },
          ],
          required: true,
        },
        { key: 'display_name', type: 'text', label: 'Nom affiché', placeholder: 'Camille', required: true },
        { key: 'plex_user_id', type: 'text', label: 'Identifiant Plex', help: 'Le nom d’utilisateur ou l’identifiant du compte Plex.', required: true, when: (values) => values.account !== 'local' },
        { key: 'plex_user_id', type: 'text', label: 'Identifiant de connexion', placeholder: 'ex. jdupont', required: true, when: (values) => values.account === 'local' },
        {
          key: 'password',
          type: 'secret',
          label: 'Mot de passe initial',
          help: '8 caractères au moins.',
          required: true,
          when: (values) => values.account === 'local',
          summary: 'hide',
          validate: (value) => (String(value || '').length < 8 ? 'Au moins 8 caractères.' : null),
        },
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
    const local = values.account === 'local';
    const { account: _account, password, ...payload } = values;
    const user = await api<{ id: number }>('/api/users', { method: 'POST', body: JSON.stringify({ ...payload, ...(local ? { source: 'local' } : {}) }) });
    if (local) await api(`/api/users/${user.id}/password`, { method: 'POST', body: JSON.stringify({ password }) });
    return {
      message: `${values.display_name} a été ajouté`,
      detail: local ? 'Il peut se connecter avec son identifiant et son mot de passe.' : 'Il peut se connecter avec son compte Plex.',
      links: [{ label: 'Voir sa fiche', to: `/users/${user.id}` }],
    };
  },
};
