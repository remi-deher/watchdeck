import { describe, expect, it } from 'vitest';
import { matchesSituation, situationCounts, userSituations } from './userSituations';

const ok = { enabled: true, notification_email: 'a@b.fr' };

describe('userSituations', () => {
  it('ne signale rien pour un compte en ordre', () => {
    expect(userSituations(ok)).toEqual([]);
  });

  it('nomme les approbations en attente, l’échec d’envoi et l’absence de contact', () => {
    const labels = userSituations({ stats: { pending_approval: 3 }, has_notification_error: true }).map((item) => item.label);
    expect(labels).toEqual(['3 à approuver', 'Échec d’envoi', 'Sans email']);
  });

  it('compte une adresse Plex ou une copie à l’administrateur comme un contact', () => {
    expect(userSituations({ plex_email: 'p@x.fr' })).toEqual([]);
    expect(userSituations({ notify_admin: true })).toEqual([]);
  });

  it('donne des compteurs et des filtres qui disent la même chose', () => {
    const users = [ok, { stats: { pending_approval: 2 }, notification_email: 'x@y.fr' }, { has_notification_error: true }];
    expect(situationCounts(users)).toEqual({ pending: 1, missing_email: 1, notification_error: 1 });
    expect(users.filter((user) => matchesSituation(user, 'missing_email'))).toHaveLength(1);
    expect(users.filter((user) => matchesSituation(user, ''))).toHaveLength(3);
  });
});
