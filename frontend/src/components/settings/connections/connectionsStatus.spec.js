import { describe, expect, it } from 'vitest';
import { rowState, verdictOf } from './connectionsStatus';

describe('rowState', () => {
  it('dit ce que le service a répondu, pas seulement s’il est configuré', () => {
    expect(rowState({ key: 'arr-1', kind: 'sonarr', name: 'Sonarr', state: 'ok', response_ms: 84, version: '4.0.9', issue_count: 2 }))
      .toEqual({ status: 'active', text: 'Opérationnel', detail: 'Joignable en 84 ms · version 4.0.9 · 2 alertes' });
  });

  it('montre la cause d’une erreur, et range une connexion coupée à part', () => {
    expect(rowState({ key: 'arr-2', kind: 'radarr', name: 'Radarr 4K', state: 'error', message: 'Connexion refusée' }))
      .toMatchObject({ status: 'error', text: 'Erreur', detail: 'Connexion refusée' });
    expect(rowState({ key: 'seer', kind: 'seer', name: 'Seer', state: 'off', message: 'Seer n’est pas activé' }).status).toBe('inactive');
  });

  it('ne conclut rien tant que l’état n’est pas connu : la ligne garde son état de configuration', () => {
    expect(rowState(undefined)).toEqual({ status: 'neutral', text: '', detail: '' });
  });
});

describe('verdictOf', () => {
  it('compte les erreurs parmi les connexions actives seulement', () => {
    const verdict = verdictOf([
      { key: 'plex', kind: 'plex', name: 'Plex', state: 'ok' },
      { key: 'arr-2', kind: 'radarr', name: 'Radarr 4K', state: 'error' },
      { key: 'seer', kind: 'seer', name: 'Seer', state: 'off' },
    ]);
    expect(verdict.errors.map((line) => line.name)).toEqual(['Radarr 4K']);
    expect([verdict.okCount, verdict.activeCount]).toEqual([1, 2]);
  });
});
