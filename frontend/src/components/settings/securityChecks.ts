/* Les contrôles de sécurité de l'instance, lus d'un coup d'œil : l'adresse publique, les
 * proxies de confiance, le jeton API et la double authentification de qui administre.
 * Fonction pure : les données viennent des réglages, de l'IP détectée, de l'état du jeton
 * et du compte, déjà chargés ailleurs. */

export interface SecurityInputs {
  publicBaseUrl: string;
  trustedProxies: string;
  /** IP détectée (`/api/settings/client-ip`) ; `null` tant qu'on ne la connaît pas. */
  clientIp: { connection_ip: string | null; client_ip: string; forwarded_for: string | null } | null;
  tokenActive: boolean;
  /** Compte connecté (`/api/me`) ; `null` tant qu'il n'est pas chargé. */
  account: { has_local_password?: boolean; totp_enabled?: boolean } | null;
}

export type CheckState = 'ok' | 'warn';

export interface SecurityCheckRow {
  key: 'url' | 'proxy' | 'token' | 'totp';
  label: string;
  state: CheckState;
  /** Mention courte à droite de la ligne (« Définie », « À configurer »…). */
  badge: string;
  detail: string;
  action: { label: string; href?: string; to?: string };
}

export function securityCheckRows(input: SecurityInputs): SecurityCheckRow[] {
  const rows: SecurityCheckRow[] = [];

  const url = input.publicBaseUrl.trim();
  if (!url) {
    rows.push({ key: 'url', label: 'Adresse publique', state: 'warn', badge: 'Non définie', detail: 'Sans elle, les emails n’ont pas de lien vers la politique de confidentialité.', action: { label: 'Renseigner', href: '#public-base-url' } });
  } else if (url.toLowerCase().startsWith('http://')) {
    rows.push({ key: 'url', label: 'Adresse publique', state: 'warn', badge: 'Non chiffrée', detail: `${url} n’utilise pas HTTPS : les connexions circulent en clair.`, action: { label: 'Modifier', href: '#public-base-url' } });
  } else {
    rows.push({ key: 'url', label: 'Adresse publique', state: 'ok', badge: 'Définie', detail: url, action: { label: 'Modifier', href: '#public-base-url' } });
  }

  const ip = input.clientIp;
  const behindUntrustedProxy = Boolean(ip?.forwarded_for) && ip?.client_ip === ip?.connection_ip;
  if (behindUntrustedProxy && ip) {
    rows.push({ key: 'proxy', label: 'Proxies de confiance', state: 'warn', badge: 'À configurer', detail: `Votre proxy transmet une IP, mais ${ip.connection_ip} n’est pas déclaré : l’anti-bruteforce voit tout le monde sous la même adresse.`, action: { label: 'Corriger', href: '#trusted-proxies' } });
  } else if (input.trustedProxies.trim()) {
    rows.push({ key: 'proxy', label: 'Proxies de confiance', state: 'ok', badge: 'Déclarés', detail: input.trustedProxies.trim(), action: { label: 'Modifier', href: '#trusted-proxies' } });
  } else {
    rows.push({ key: 'proxy', label: 'Proxies de confiance', state: 'ok', badge: 'Aucun proxy détecté', detail: 'Les visiteurs arrivent directement, sans intermédiaire.', action: { label: 'Modifier', href: '#trusted-proxies' } });
  }

  rows.push({
    key: 'token',
    label: 'Jeton API',
    state: 'ok',
    badge: input.tokenActive ? 'Actif' : 'Aucun jeton',
    detail: input.tokenActive ? 'Accès complet à l’API, jamais réaffiché après sa génération.' : 'Aucun accès externe à l’API n’est ouvert.',
    action: { label: 'Gérer', to: '/settings/security/api' },
  });

  // Comme sur la page Profil : la double authentification ne protège que le mot de passe local.
  if (input.account?.has_local_password) {
    rows.push(input.account.totp_enabled
      ? { key: 'totp', label: 'Double authentification', state: 'ok', badge: 'Activée', detail: 'Un code à 6 chiffres est demandé après le mot de passe.', action: { label: 'Ouvrir le profil', to: '/profile' } }
      : { key: 'totp', label: 'Double authentification', state: 'warn', badge: 'Désactivée', detail: 'Pour votre compte administrateur, le mot de passe suffit pour se connecter.', action: { label: 'Activer', to: '/profile' } });
  }
  return rows;
}
