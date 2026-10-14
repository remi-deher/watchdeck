import { describe, expect, it } from 'vitest';
import { adviceFor, issueReasons, primaryCommand, taskActions, taskDetail, taskEvent, taskState, taskTrackItem } from './storageTasks';

const ctx = {
  locationName: (id) => `Stockage ${id}`,
  instanceName: () => 'Sonarr',
  status: (value) => value,
  gb: (value) => `${(Number(value) / 1e9).toFixed(1)} Go`,
  date: (value) => String(value),
  taskTo: (id) => ({ query: { tache: String(id) } }),
};
const job = (status, extra = {}) => ({ id: 1, status, desired_state: 'run', source_id: 1, destination_id: 2, params: { name: 'Libérer', transfer_mode: 'rsync_ssh' }, items: [], ...extra });

describe('état de suivi d’une tâche', () => {
  it('classe d’abord ce qui demande d’agir', () => {
    expect(taskState(job('running'))).toBe('running');
    expect(taskState(job('queued'))).toBe('waiting');
    expect(taskState(job('draft'))).toBe('waiting');
    expect(taskState(job('paused'))).toBe('paused');
    expect(taskState(job('blocked'))).toBe('blocked');
    expect(taskState(job('running', { items: [{ status: 'failed' }] }))).toBe('blocked');
    expect(taskState(job('completed'))).toBe('completed');
    expect(taskState(job('cancelled'))).toBe('cancelled');
  });
});

describe('commande principale', () => {
  it('suspend ce qui tourne, relance ce qui est bloqué, reprend le reste', () => {
    expect(primaryCommand(job('running'))).toMatchObject({ key: 'pause' });
    expect(primaryCommand(job('blocked'))).toMatchObject({ key: 'retry' });
    expect(primaryCommand(job('paused', { desired_state: 'pause' }))).toMatchObject({ key: 'resume' });
    expect(primaryCommand(job('draft'))).toMatchObject({ key: 'verify' });
    expect(primaryCommand(job('completed'))).toBeNull();
    expect(primaryCommand(job('cancelling'))).toBeNull();
  });
});

describe('titres à traiter', () => {
  const blocked = job('paused', { items: [{ status: 'blocked', reason: 'Lecture en cours' }, { status: 'blocked', reason: 'Lecture en cours' }, { status: 'failed' }, { status: 'completed' }] });
  it('regroupe les motifs et conseille', () => {
    expect(issueReasons(blocked, (v) => v)).toEqual([{ reason: 'Lecture en cours', count: 2 }, { reason: 'failed', count: 1 }]);
    expect(adviceFor('Lecture en cours')).toContain('fin de la lecture');
    expect(adviceFor('Espace insuffisant')).toContain('Libérer de la place');
  });
  it('porte la cause sur la carte de suivi', () => {
    const item = taskTrackItem(blocked, ctx);
    expect(item.state).toBe('blocked');
    expect(item.cause.reasons).toContain('2 titre(s) : Lecture en cours');
    expect(item.actions.map((a) => a.key)).toEqual(['resume', 'cancel']);
  });
});

describe('historique', () => {
  const done = job('completed', { released_bytes: 56e9, updated_at: '2026-10-06T22:18:00', items: [{ status: 'completed', media_type: 'series', presentation: { counts: { episodes: 25, seasons: 1 } }, progress: { finished_at: '2026-10-06T22:18:00', started_at: '2026-10-06T21:32:00', copy_seconds: 2000, measured_copy_bytes: 40e9 } }] });
  it('résume une tâche terminée en un événement', () => {
    const event = taskEvent(done, ctx);
    expect(event.outcome).toBe('success');
    expect(event.detail).toContain('25 épisodes · 1 saisons');
    expect(event.detail).toContain('56.0 Go libérés');
  });
  it('propose de relancer depuis le détail et garde le lien vers la fiche', () => {
    const detail = taskDetail(done, ctx);
    expect(detail.action).toEqual({ key: 'relaunch', label: 'Relancer' });
    expect(detail.comparison.find((c) => c.label.startsWith('Débit')).after).toBe('20 Mo/s');
    expect(detail.links[0].to).toEqual({ query: { tache: '1' } });
  });
  it('ne plante pas sans date', () => {
    expect(taskEvent(job('cancelled'), ctx).at).toBe('1970-01-01T00:00:00Z');
  });
});

describe('actions de la fiche', () => {
  it('une tâche terminée se relance ou se modifie, les autres actions sont dans le menu', () => {
    const actions = taskActions(job('completed'));
    expect(actions.filter((a) => !a.menu).map((a) => a.key)).toEqual(['relaunch', 'edit']);
    expect(actions.find((a) => a.key === 'remove').danger).toBe(true);
  });
});
