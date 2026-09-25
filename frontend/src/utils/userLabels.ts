/**
 * Vocabulaire de la page Utilisateurs.
 *
 * Les colonnes rendaient jusqu'ici les valeurs de la base telles quelles : on lisait
 * `rss`, `local`, `api`, `user`, `admin` — des identifiants de code, en anglais, dans une
 * interface française. Pire, l'origine manquante était remplacée par « plex », ce qui
 * affichait une supposition comme si c'était une donnée.
 *
 * Ce module est la seule source de ces libellés, pour que la table, la fiche et les
 * filtres ne puissent plus diverger.
 */

export interface AccountLike {
  custom_name?: string | null;
  display_name?: string | null;
  plex_user_id?: string | null;
  plex_email?: string | null;
  notification_email?: string | null;
  source?: string | null;
  role?: string | null;
  enabled?: boolean | null;
  seer_user_id?: number | null;
  seer_active?: boolean | null;
  avatar_url?: string | null;
  plex_account_uuid?: string | null;
}

/* `api` n'est pas un detail d'implementation : c'est la population importee depuis la
   liste de comptes du serveur Plex lui-meme -- les utilisateurs Plex Home et
   l'administrateur du serveur -- par opposition a `rss`, un compte seulement apercu via
   le flux watchlist. Affiche « API » tout court, le mot ne designait plus rien. */
const SOURCES: Record<string, string> = {
  plex: 'Compte Plex',
  seer: 'Compte Seer',
  rss: 'Flux RSS',
  local: 'Compte local',
  api: 'Plex Home / Admin',
};

const ROLES: Record<string, string> = {
  admin: 'Administrateur',
  moderator: 'Modérateur',
  user: 'Utilisateur',
};

/* Identifiant de compte Plex : une suite hexadécimale. Plex en émet de plusieurs
   longueurs selon l'ancienneté du compte — 16 caractères sur l'installation observée
   (`86dd231816e161be`), 32 ailleurs. On accepte donc la plage, et non une longueur
   fixe qui aurait laissé la majorité des comptes en « origine inconnue ». */
const PLEX_ID_RE = /^[0-9a-f]{16,32}$/i;

/**
 * Origine du compte.
 *
 * La table faisait `source || 'plex'` : une valeur par défaut aveugle, qui présentait
 * une supposition comme une donnée. Mais tout dire « inconnu » n'est pas mieux — la
 * majorité des comptes historiques n'ont pas la colonne renseignée alors qu'ils portent
 * un identifiant Plex sans ambiguïté.
 *
 * On déduit donc à partir d'une PREUVE (la forme de l'identifiant, ou un UUID de compte
 * Plex), et on ne dit « inconnu » que lorsqu'il n'y a réellement rien sur quoi s'appuyer.
 */
export function resolveSource(user: AccountLike): string | null {
  if (user.source) return user.source;
  if (user.plex_account_uuid) return 'plex';
  const id = user.plex_user_id || '';
  if (PLEX_ID_RE.test(id)) return 'plex';
  return null;
}

export function sourceLabel(source?: string | null): string {
  if (!source) return 'Origine inconnue';
  return SOURCES[source] || source;
}

export function roleLabel(role?: string | null): string {
  if (!role) return ROLES.user;
  return ROLES[role] || role;
}

/**
 * Nom à afficher en premier : celui que l'administrateur a choisi, sinon le pseudo du
 * service d'origine, sinon l'adresse e-mail. Le dernier recours reste l'identifiant
 * technique — mais il ne doit plus être le cas courant.
 */
export function accountName(user: AccountLike): string {
  return (
    user.custom_name?.trim() ||
    user.display_name?.trim() ||
    user.notification_email?.trim() ||
    user.plex_email?.trim() ||
    user.plex_user_id ||
    'Compte sans nom'
  );
}

/**
 * Second niveau d'identité : le pseudo sous lequel la personne se reconnaît.
 *
 * La table montrait `plex_user_id` — un hachage opaque (`86dd231816e161be`) ou un
 * identifiant synthétique (`seer:6`) — et n'affichait jamais le pseudo réel. C'est
 * l'inverse qu'il faut : le hachage n'aide personne à reconnaître un compte, il
 * appartient à la fiche détail.
 *
 * Retourne une chaîne vide quand il n'y a pas de pseudo distinct à montrer. Pas de repli
 * sur l'e-mail : la colonne « Notifications » l'affiche déjà, et la ligne le répétait
 * deux fois pour les comptes dont le nom et le pseudo coïncident.
 */
export function accountHandle(user: AccountLike): string {
  const handle = user.display_name?.trim();
  if (!handle) return '';
  return handle === accountName(user) ? '' : handle;
}

/** Initiales pour la pastille quand aucun avatar n'est disponible. */
export function accountInitials(user: AccountLike): string {
  const name = accountName(user);
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

export type SeerMode = 'observer' | 'actor' | null | undefined;

/**
 * Ce que Watchdeck fait réellement avec Seer, dans le vocabulaire déjà employé par les
 * Réglages (« Observateur — Seer n'est qu'une source d'information »).
 *
 * La page proposait « Synchroniser Seer » même Seer désactivé, et employait le verbe
 * « synchroniser » en mode observateur — où Seer est justement consulté en lecture
 * seule, sans rien piloter.
 */
export function seerActionLabel(enabled: boolean, mode: SeerMode): string {
  if (!enabled) return 'Seer désactivé';
  return mode === 'actor' ? 'Synchroniser Seer' : 'Relire les comptes Seer';
}

/** État de la liaison Seer d'un compte, indépendant de l'activation du compte lui-même. */
export function seerLinkLabel(user: AccountLike): string {
  if (!user.seer_user_id) return 'Non lié';
  return user.seer_active ? 'Lié et actif' : 'Lié, inactif côté Seer';
}

/* Demandes creees par Watchdeck lui-meme (import manuel, synchro *arr) : miroir de
   PSEUDO_REQUESTERS cote backend. Elles n'ont pas de demandeur, on n'affiche rien. */
const PSEUDO_REQUESTERS = new Set(['', 'manual', 'system', 'unknown', 'arr', 'plex']);

export function isPseudoRequester(id?: string | null): boolean {
  return PSEUDO_REQUESTERS.has(id || '');
}

/** Nom du demandeur d'une demande, ou chaîne vide quand il n'y en a pas de réel. */
export function requesterName(row: { plex_user_id?: string | null; requested_by?: string | null; plex_user?: string | null; custom_name?: string | null }): string {
  if (isPseudoRequester(row.plex_user_id)) return '';
  return row.custom_name || row.requested_by || row.plex_user || row.plex_user_id || '';
}
