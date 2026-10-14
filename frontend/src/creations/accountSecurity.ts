/* Securite du compte : mot de passe, double authentification, passkey. Une definition par geste ;
   ce qui parle au serveur (et rafraichit le compte) vient de la page, d'ou les fabriques. */
import type { CreateDefinition } from '@/components/templates/create/types';

const SIX_DIGITS = (value: unknown) => (/^\d{6}$/.test(String(value ?? '').trim()) ? undefined : 'Le code comporte 6 chiffres.');

export interface PasswordDraft { currentPassword: string; otpCode: string; newPassword: string }

export function passwordForm(options: { hasPassword: boolean; totpEnabled: boolean }, save: (draft: PasswordDraft) => Promise<void>): CreateDefinition {
  return {
    noun: 'un mot de passe',
    another: 'un autre mot de passe',
    editTitle: options.hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe',
    submitLabel: 'Enregistrer',
    quick: true,
    initial: () => ({ currentPassword: '', otpCode: '', newPassword: '' }),
    steps: [{
      key: 'password',
      label: 'Mot de passe',
      title: 'Quel mot de passe voulez-vous ?',
      fields: [
        { key: 'currentPassword', type: 'secret', label: 'Mot de passe actuel', when: () => options.hasPassword, required: true },
        { key: 'otpCode', type: 'text', label: 'Code à 6 chiffres', help: 'Pour confirmer qu’il s’agit bien de vous.', placeholder: '123456', when: () => !options.hasPassword && options.totpEnabled, validate: SIX_DIGITS },
        {
          key: 'newPassword',
          type: 'secret',
          label: 'Nouveau mot de passe',
          help: 'Au moins 8 caractères. Vos autres appareils seront déconnectés.',
          required: true,
          validate: (value) => (String(value ?? '').length >= 8 ? undefined : 'Au moins 8 caractères.'),
        },
      ],
    }],
    submit: async (values) => {
      await save({ currentPassword: String(values.currentPassword ?? ''), otpCode: String(values.otpCode ?? ''), newPassword: String(values.newPassword) });
      return { message: 'Mot de passe enregistré. Vos autres appareils ont été déconnectés.' };
    },
  };
}

export interface TotpSetup { secret: string; qr: string }

export function totpSetupForm(setup: () => Promise<TotpSetup>, enable: (code: string) => Promise<void>): CreateDefinition {
  return {
    noun: 'la double authentification',
    another: 'la double authentification',
    editTitle: 'Activer la double authentification',
    subtitle: 'Trois étapes, environ une minute.',
    submitLabel: 'Activer',
    quick: true,
    initial: () => ({ secret: '', qr: '', code: '' }),
    steps: [{
      key: 'scan',
      label: 'Activation',
      title: 'Scannez le QR code',
      loading: 'Préparation du QR code…',
      onEnter: async (values) => {
        const data = await setup();
        values.secret = data.secret;
        values.qr = data.qr;
      },
      fields: [
        { key: 'steps', type: 'note', label: 'Étapes', text: '1. Ouvrez votre application d’authentification (Google Authenticator, Bitwarden, 1Password…).\n2. Scannez ce QR code.\n3. Saisissez le code à 6 chiffres qu’elle affiche.' },
        { key: 'qr', type: 'image', label: 'QR code de double authentification', text: (values) => String(values.qr ?? ''), when: (values) => Boolean(values.qr) },
        { key: 'secretHelp', type: 'note', label: 'Clé', text: (values) => `Impossible de scanner ? Saisissez cette clé : ${values.secret}`, when: (values) => Boolean(values.secret) },
        { key: 'code', type: 'text', label: 'Code à 6 chiffres', placeholder: '123456', required: true, validate: SIX_DIGITS },
      ],
    }],
    submit: async (values) => {
      await enable(String(values.code).trim());
      return { message: 'Double authentification activée.' };
    },
  };
}

export function totpDisableForm(disable: (code: string) => Promise<void>): CreateDefinition {
  return {
    noun: 'la double authentification',
    another: 'la double authentification',
    editTitle: 'Désactiver la double authentification',
    subtitle: 'Le mot de passe suffira de nouveau pour se connecter.',
    submitLabel: 'Désactiver',
    quick: true,
    initial: () => ({ code: '' }),
    steps: [{
      key: 'code',
      label: 'Code',
      title: 'Confirmez avec un code',
      fields: [{ key: 'code', type: 'text', label: 'Code à 6 chiffres', help: 'Un code actuel de votre application, pour confirmer.', placeholder: '123456', required: true, validate: SIX_DIGITS }],
    }],
    submit: async (values) => {
      await disable(String(values.code).trim());
      return { message: 'Double authentification désactivée.' };
    },
  };
}

export function passkeyForm(register: (name: string) => Promise<void>): CreateDefinition {
  return {
    noun: 'une passkey',
    another: 'une autre passkey',
    editTitle: 'Ajouter une passkey',
    subtitle: 'Votre navigateur va demander votre empreinte, votre visage ou votre clé de sécurité.',
    submitLabel: 'Continuer',
    quick: true,
    initial: () => ({ name: '' }),
    steps: [{
      key: 'name',
      label: 'Nom',
      title: 'Comment l’appeler ?',
      fields: [{ key: 'name', type: 'text', label: 'Nom', help: 'Pour la reconnaître dans la liste : « iPhone », « 1Password »…', placeholder: 'Passkey' }],
    }],
    submit: async (values) => {
      await register(String(values.name ?? '').trim() || 'Passkey');
      return { message: 'Passkey enregistrée.' };
    },
  };
}
