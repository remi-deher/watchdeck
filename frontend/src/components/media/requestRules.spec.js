import { describe, expect, it } from 'vitest';

import {
  availableMailProgress,
  journalEvents,
  journeyHeadline,
  journeySteps,
  journeySubtitle,
  pendingAvailableRequesters,
} from './requestRules';

const row = {
  id: 7,
  media_type: 'movie',
  status: 'available',
  operational_status: 'completed',
  origin_kind: 'request',
  requester_ids: ['remi', 'admin', 'fred'],
  requesters: ['Rémi', 'Administrateur', 'Frédérique'],
  requested_at: '2026-09-20T10:02:00',
  arr_processed_at: '2026-09-20T10:03:00',
  torrent_completed_at: '2026-09-21T23:40:00',
  available_at: '2026-09-22T00:20:00',
  has_vf: true,
  last_request_mail: { sent_at: '2026-09-20T10:03:30', triggered_by: 'auto', success: true },
  last_available_mail: { sent_at: '2026-09-22T00:21:00', triggered_by: 'manual', success: false },
  requester_notifications: {
    remi: { request: true, available: true },
    admin: { request: true, available: true },
    fred: { request: null, available: false },
  },
};

describe('parcours de la demande', () => {
  it('construit une frise datée sans inventer de date', () => {
    const steps = journeySteps(row);
    expect(steps.map((s) => s.label)).toEqual([
      'Demandée', 'Transmise à Radarr', 'Téléchargée', 'Importée', 'Dans Plex', 'Demandeurs prévenus',
    ]);
    expect(steps.slice(0, 5).every((s) => s.state === 'done')).toBe(true);
    expect(steps[3].at).toBeNull();
    expect(steps[5]).toMatchObject({ state: 'current', note: '2 sur 3', noteTone: 'attention' });
  });

  it('suit le statut opérationnel en cours et nomme Sonarr pour une série', () => {
    const steps = journeySteps({ ...row, media_type: 'show', status: 'sent_to_arr', operational_status: 'downloading' });
    expect(steps[1].label).toBe('Transmise à Sonarr');
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(steps[5].note).toBeUndefined();
  });

  it('marque l’étape en erreur', () => {
    const steps = journeySteps({ ...row, status: 'failed', operational_status: 'failed' });
    expect(steps[2]).toMatchObject({ state: 'error', label: 'En erreur' });
  });

  it('résume l’état en une phrase', () => {
    const now = new Date('2026-09-24T01:00:00Z');
    expect(journeyHeadline(row, now)).toBe('Disponible dans Plex depuis 2 jours');
    expect(journeySubtitle(row, now)).toBe('Demandée par Rémi le 20 sept. · VF présente · suivi terminé');
  });
});

describe('demandeurs à prévenir', () => {
  it('liste ceux qui attendent le mail de disponibilité', () => {
    expect(pendingAvailableRequesters(row)).toEqual([{ uid: 'fred', name: 'Frédérique' }]);
    expect(availableMailProgress(row)).toEqual({ sent: 2, total: 3 });
    expect(pendingAvailableRequesters({ ...row, status: 'sent_to_arr' })).toEqual([]);
  });
});

describe('journal', () => {
  it('trie les évènements du plus récent au plus ancien', () => {
    const labels = journalEvents(row).map((e) => e.label);
    expect(labels).toEqual([
      'Échec du mail « disponible » (manuel)',
      'Détectée dans Plex, piste française trouvée',
      'Téléchargement terminé',
      'Mail « demande reçue » envoyé (auto)',
      'Transmise à Radarr',
      'Demandée par Rémi',
    ]);
    expect(journalEvents(row)[0].tone).toBe('error');
  });

  it('reprend la date de demande du parcours serveur et gère une origine *ARR', () => {
    const fromTimeline = journalEvents({ requesters: ['A'], requester_ids: ['a'], workflow_timeline: [{ key: 'requested', occurred_at: '2026-09-01T08:00:00' }] });
    expect(fromTimeline).toEqual([{ key: 'requested', at: '2026-09-01T08:00:00', label: 'Demandée par A' }]);
    const arr = journalEvents({ origin_kind: 'arr', media_type: 'show', arr_processed_at: '2026-09-01T08:00:00' });
    expect(arr.map((e) => e.label)).toEqual(['Ajoutée directement dans Sonarr']);
  });
});
