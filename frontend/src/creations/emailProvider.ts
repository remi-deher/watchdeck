/* Creer : un fournisseur d'envoi d'email (SMTP, SMTP OAuth2 Microsoft, API Brevo). La meme
   definition sert a la modification (`id`) ; mots de passe, secrets et cles vides = conserves.
   Le compte Microsoft se connecte une fois le fournisseur enregistre (lien du resultat) et se
   deconnecte en decochant « Compte Microsoft connecte ». */
import { api } from '@/api';
import type { CreateDefinition } from '@/components/templates/create/types';

const TYPES = [
  { value: 'smtp', label: 'SMTP', description: 'Utilisateur et mot de passe' },
  { value: 'smtp_oauth2', label: 'SMTP OAuth2', description: 'Microsoft : hotmail.fr, outlook.com' },
  { value: 'brevo', label: 'API Brevo', description: 'Sans serveur SMTP' },
];
const redirectUri = () => `${window.location.origin}/api/email-providers/smtp-oauth/callback`;
const isSmtp = (values: Record<string, any>) => values.provider_type === 'smtp' || values.provider_type === 'smtp_oauth2';

export function emailProviderCreation(id: number | string | null, done: (message: string) => void): CreateDefinition {
  return {
    noun: 'un fournisseur',
    another: 'un autre fournisseur',
    editTitle: 'Modifier le fournisseur',
    initial: () => ({
      name: '', provider_type: 'smtp', enabled: true,
      smtp_host: '', smtp_port: 587, smtp_tls: true, smtp_user: '', smtp_password: '',
      oauth_tenant: 'consumers', oauth_client_id: '', oauth_client_secret: '', oauth_mailbox: '', oauth_connected: false,
      brevo_api_key: '',
    }),
    steps: [
      {
        key: 'type',
        label: 'Type',
        title: 'Comment envoyer les emails ?',
        fields: [
          { key: 'name', type: 'text', label: 'Nom', placeholder: 'Hotmail perso', required: true },
          { key: 'provider_type', type: 'cards', label: 'Type', options: TYPES, required: true },
        ],
      },
      {
        key: 'server',
        label: 'Serveur',
        title: 'Où partent les emails ?',
        when: isSmtp,
        fields: [
          { key: 'smtp_host', type: 'text', label: 'Serveur SMTP', required: true, placeholder: 'smtp-mail.outlook.com' },
          { key: 'smtp_port', type: 'number', label: 'Port', required: true },
          { key: 'smtp_tls', type: 'toggle', label: 'TLS' },
          { key: 'smtp_user', type: 'text', label: 'Utilisateur', when: (values) => values.provider_type === 'smtp' },
          { key: 'smtp_password', type: 'secret', label: 'Mot de passe', help: id ? 'Laisser vide pour conserver.' : undefined, when: (values) => values.provider_type === 'smtp', summary: 'hide' },
        ],
      },
      {
        key: 'oauth',
        label: 'Microsoft',
        title: 'Votre application Microsoft',
        when: (values) => values.provider_type === 'smtp_oauth2',
        fields: [
          {
            key: 'oauth_note', type: 'note', label: '',
            text: () => `Microsoft a désactivé l’authentification par mot de passe pour outlook.com et hotmail.fr : enregistrez une application dans Azure AD (App registrations, portal.azure.com), autorisez-la pour les comptes personnels et ajoutez l’URI de redirection ${redirectUri()}.`,
          },
          { key: 'oauth_mailbox', type: 'email', label: 'Boîte Microsoft', placeholder: 'vous@hotmail.fr' },
          { key: 'oauth_tenant', type: 'text', label: 'Tenant', help: '« consumers » pour un compte personnel hotmail.fr ou outlook.com.' },
          { key: 'oauth_client_id', type: 'text', label: 'Client ID' },
          { key: 'oauth_client_secret', type: 'secret', label: 'Client secret (facultatif)', help: 'Laisser vide pour conserver, ou si le client est public.' },
          { key: 'oauth_connected', type: 'toggle', label: 'Compte Microsoft connecté', when: (values) => Boolean(id) && Boolean(values.__wasConnected) },
          { key: 'connect_note', type: 'note', label: '', when: () => !id, text: 'Enregistrez d’abord le fournisseur : le bouton de connexion à votre compte Microsoft apparaît ensuite.' },
        ],
      },
      {
        key: 'brevo',
        label: 'Brevo',
        title: 'Votre clé API Brevo',
        when: (values) => values.provider_type === 'brevo',
        fields: [
          { key: 'brevo_note', type: 'note', label: '', text: 'Créez une clé API dans Brevo (Paramètres, Clés API) et vérifiez l’adresse expéditrice de l’application dans Brevo (Expéditeurs et IP) avant le premier envoi.' },
          { key: 'brevo_api_key', type: 'secret', label: 'Clé API Brevo', help: id ? 'Laisser vide pour conserver.' : undefined },
        ],
      },
      {
        key: 'state',
        label: 'Activation',
        title: 'Activer ce fournisseur ?',
        fields: [{ key: 'enabled', type: 'toggle', label: 'Fournisseur actif' }],
      },
    ],
    submit: async (values) => {
      const { __wasConnected, oauth_connected, ...payload } = values;
      await api(id ? `/api/email-providers/${id}` : '/api/email-providers', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      if (id && __wasConnected && !oauth_connected) {
        await api(`/api/email-providers/${id}/smtp-oauth/disconnect`, { method: 'POST' });
      }
      done(id ? 'Fournisseur mis à jour.' : 'Fournisseur ajouté.');
      const connect = id && values.provider_type === 'smtp_oauth2' && (!__wasConnected || oauth_connected);
      return {
        message: `Fournisseur « ${values.name} » ${id ? 'mis à jour' : 'ajouté'}`,
        detail: values.provider_type === 'smtp_oauth2' && !__wasConnected ? 'Il reste à connecter votre compte Microsoft.' : undefined,
        links: [
          ...(connect ? [{ label: __wasConnected ? 'Reconnecter Microsoft' : 'Connecter avec Microsoft', href: `/api/email-providers/${id}/smtp-oauth/authorize` }] : []),
          { label: 'Voir les canaux', to: '/settings/notifications/channels' },
        ],
      };
    },
  };
}
