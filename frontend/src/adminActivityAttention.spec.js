import { describe, expect, it } from 'vitest';
import { areaSeverity, buildAttention, urgentCount } from './adminAttention';

const quiet = {
  requests: { pending_approval: 0, failed: 0 },
  conflicts: { count: 0 },
  issues: { open: 0 },
  notifications: { queue: 0, hold: false, sent_7d: 12, failed_7d: 0, by_day: [1, 2, 3, 0, 1, 2, 3] },
  storage: { connections: 1, running_transfers: 0, blocked_transfers: 0 },
};
const keys = (items) => items.map((item) => item.key);

describe('adminAttention — activité de l’instance', () => {
  it('ne dit rien d’une instance calme, ni quand l’aperçu manque', () => {
    expect(buildAttention({ overview: quiet })).toEqual([]);
    expect(buildAttention({ overview: null })).toEqual([]);
    expect(buildAttention({})).toEqual([]);
  });

  it('ne dit rien d’un bloc que le serveur n’a pas pu calculer', () => {
    // Un bloc `null` n'est pas un zéro : on n'affirme rien plutôt que « tout va bien ».
    expect(buildAttention({ overview: { requests: null, conflicts: null, issues: null, notifications: null, storage: null } })).toEqual([]);
  });

  it('signale les demandes qui attendent une approbation, avec le bon pluriel', () => {
    const [one] = buildAttention({ overview: { ...quiet, requests: { pending_approval: 1, failed: 0 } } });
    expect(one).toMatchObject({ key: 'requests-approval', severity: 'warn', area: 'admin-requests', title: '1 demande à approuver' });
    expect(one.action.to).toBe('/discover/requests');

    const [many] = buildAttention({ overview: { ...quiet, requests: { pending_approval: 3, failed: 0 } } });
    expect(many.title).toBe('3 demandes à approuver');
  });

  it('range échecs, conflits et transferts bloqués sous l’acquisition', () => {
    const items = buildAttention({
      overview: {
        ...quiet,
        requests: { pending_approval: 0, failed: 2 },
        conflicts: { count: 1 },
        storage: { connections: 1, running_transfers: 0, blocked_transfers: 2 },
      },
    });
    expect(keys(items)).toEqual(['requests-failed', 'conflicts', 'storage-blocked']);
    expect(items.every((item) => item.area === 'admin-acquisition')).toBe(true);
    expect(items.map((item) => item.action.to)).toEqual(['/library?status=failed', '/downloads/acquisitions', '/storage']);
    expect(areaSeverity(items, 'admin-acquisition')).toBe('warn');
  });

  it('signale l’envoi suspendu avec la file qui attend, et les échecs de la semaine à part', () => {
    const items = buildAttention({
      overview: { ...quiet, notifications: { queue: 4, hold: true, sent_7d: 5, failed_7d: 2, by_day: [] } },
    });
    expect(keys(items)).toEqual(['notifications-hold', 'notifications-failed']);
    expect(items[0].detail).toBe('4 notifications attendent dans la file.');
    expect(items[0].action.to).toBe('/notifications?tab=pending');
    // Les échecs passés informent, ils n'exigent pas d'agir : la pastille ne s'allume pas pour eux.
    expect(items[1].severity).toBe('info');
    expect(urgentCount(items)).toBe(1);
  });

  it('range les signalements hors de toute zone de réglages', () => {
    const [issue] = buildAttention({ overview: { ...quiet, issues: { open: 2 } } });
    expect(issue).toMatchObject({ key: 'issues-open', area: 'admin-overview', title: '2 problèmes signalés' });
    expect(issue.action.to).toBe('/issues');
  });

  it('classe l’activité avec le reste, les erreurs d’abord', () => {
    const items = buildAttention({
      services: { plex: { state: 'error' } },
      overview: { ...quiet, requests: { pending_approval: 1, failed: 0 } },
    });
    expect(keys(items)).toEqual(['service-plex', 'requests-approval']);
  });
});
