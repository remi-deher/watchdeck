/* Les situations d'un compte qui demandent un geste : une règle unique pour les puces de la
 * liste, les pastilles de chaque ligne et leurs compteurs. La liste ne peut plus annoncer
 * « 2 sans email » alors que les lignes en montrent trois. */

export interface SituationUser {
  enabled?: boolean;
  notification_email?: string | null;
  plex_email?: string | null;
  notify_admin?: boolean;
  has_notification_error?: boolean;
  stats?: { pending_approval?: number };
}

export type SituationKey = 'pending' | 'missing_email' | 'notification_error';

export interface Situation {
  key: SituationKey;
  label: string;
  tone: 'warn' | 'error';
}

export function hasNoContact(user: SituationUser): boolean {
  return !user.notification_email && !user.plex_email && !user.notify_admin;
}

export function userSituations(user: SituationUser): Situation[] {
  const found: Situation[] = [];
  const pending = user.stats?.pending_approval || 0;
  if (pending > 0) found.push({ key: 'pending', label: `${pending} à approuver`, tone: 'warn' });
  if (user.has_notification_error) found.push({ key: 'notification_error', label: 'Échec d’envoi', tone: 'error' });
  if (hasNoContact(user)) found.push({ key: 'missing_email', label: 'Sans email', tone: 'warn' });
  return found;
}

/** Combien de comptes ont chaque situation : les compteurs des puces de filtre. */
export function situationCounts(users: SituationUser[]): Record<SituationKey, number> {
  const counts: Record<SituationKey, number> = { pending: 0, missing_email: 0, notification_error: 0 };
  for (const user of users) for (const item of userSituations(user)) counts[item.key] += 1;
  return counts;
}

export function matchesSituation(user: SituationUser, key: string): boolean {
  if (!key) return true;
  return userSituations(user).some((item) => item.key === key);
}
