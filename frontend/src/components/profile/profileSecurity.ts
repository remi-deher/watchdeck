/* Etat de protection d'un compte, pour la page Profil.
 *
 * La double authentification ne protege que la connexion par mot de passe local (voir
 * /api/auth/login) : un compte qui se connecte uniquement avec Plex ou une passkey n'a
 * rien a y gagner, et la lui reclamer ferait une alerte permanente sans objet. Elle
 * n'entre donc dans le compte que si un mot de passe local existe. */

export interface ProfileAccount {
  has_local_password?: boolean;
  totp_enabled?: boolean;
  passkey_count?: number;
  role?: string;
}

export interface ProfilePreferences {
  notification_email?: string | null;
  notify_on_request?: boolean | null;
  notify_on_available?: boolean | null;
  notify_digest?: boolean | null;
  notify_newsletter?: boolean | null;
  notify_vf_movie?: boolean | null;
  notify_vf_series?: boolean | null;
}

export type SecurityCheckKey = 'login' | 'totp' | 'passkey';

export interface SecurityCheck {
  key: SecurityCheckKey;
  ok: boolean;
  label: string;
  detail: string;
}

export function securityChecks(account: ProfileAccount | null | undefined): SecurityCheck[] {
  if (!account) return [];
  const passkeys = account.passkey_count || 0;
  const checks: SecurityCheck[] = [
    account.has_local_password
      ? { key: 'login', ok: true, label: 'Mot de passe', detail: 'Défini pour la connexion par identifiant.' }
      : { key: 'login', ok: true, label: 'Connexion avec Plex', detail: 'Pas de mot de passe propre à Watchdeck : Plex vérifie votre identité.' },
  ];
  if (account.has_local_password) {
    checks.push(account.totp_enabled
      ? { key: 'totp', ok: true, label: 'Double authentification', detail: 'Un code à 6 chiffres est demandé après le mot de passe.' }
      : {
        key: 'totp',
        ok: false,
        label: 'Double authentification',
        detail: account.role === 'admin'
          ? 'Désactivée. Recommandée pour un administrateur : sans elle, le mot de passe suffit pour se connecter.'
          : 'Désactivée : le mot de passe suffit pour se connecter.',
      });
  }
  checks.push(passkeys
    ? { key: 'passkey', ok: true, label: 'Passkey', detail: passkeys > 1 ? `${passkeys} enregistrées.` : '1 enregistrée.' }
    : { key: 'passkey', ok: false, label: 'Passkey', detail: 'Aucune : connectez-vous par empreinte, visage ou clé de sécurité, sans mot de passe.' });
  return checks;
}

export function securityScore(checks: SecurityCheck[]): { done: number; total: number } {
  return { done: checks.filter((c) => c.ok).length, total: checks.length };
}

/** L'action a mettre en avant sur l'Apercu : la 2FA manquante d'abord, puis la passkey. */
export function firstSecurityGap(checks: SecurityCheck[]): SecurityCheck | null {
  return checks.find((c) => !c.ok && c.key === 'totp') || checks.find((c) => !c.ok) || null;
}
