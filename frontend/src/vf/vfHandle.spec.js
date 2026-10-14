import { describe, expect, it } from 'vitest';
import { auditIssues, auditItemToHandle, groupBucket, itemBucket, scanItemLabel, scanRunDetail, scanRunToEvent, searchTarget, upgradeGroupToHandle, upgradeIssues } from './vfHandle';

const item = (status, over = {}) => ({ id: 1, source_type: 'library_item', source_id: 7, scope: 'episode', media_type: 'show', status, ...over });
const group = (items, over = {}) => ({ key: 'library_item:7', source_type: 'library_item', source_id: 7, media: { title: 'The Bear', media_type: 'show', poster_url: '/p.jpg' }, items, seasons: [], releaseCount: 0, ...over });

describe('suggestions de release', () => {
  it('range chaque cible dans son etat, l’ignore l’emportant', () => {
    expect(itemBucket(item('pending'))).toBe('pending');
    expect(itemBucket(item('downloading'))).toBe('in_progress');
    expect(itemBucket(item('verified'))).toBe('history');
    expect(itemBucket(item('pending', { is_ignored: true }))).toBe('ignored');
  });

  it('place le groupe sous ce qui demande le plus d’attention', () => {
    expect(groupBucket(group([item('verified'), item('failed'), item('pending')]))).toBe('failed');
    expect(groupBucket(group([item('waiting_release'), item('downloading')]))).toBe('waiting_release');
  });

  it('dit le probleme, la cause d’un echec et la correction proposee', () => {
    const handle = upgradeGroupToHandle(group([item('failed', { arr_message: 'Indexeur injoignable' }), item('pending')], { releaseCount: 3 }), '/library/media/library/7');
    expect(handle.issue).toBe('failed');
    expect(handle.urgency).toBe('high');
    expect(handle.problem).toContain('Indexeur injoignable');
    expect(handle.proposal).toBe('3 releases VF disponibles');
    expect(handle.actions.map((action) => action.key)).toEqual(['search', 'ignore']);
    expect(handle.actions[0].label).toBe('Chercher une autre release');
  });

  it('propose de réactiver un média ignoré, et rien pour ce qui avance seul', () => {
    expect(upgradeGroupToHandle(group([item('pending', { is_ignored: true })]), null).actions.map((action) => action.key)).toEqual(['reactivate']);
    expect(upgradeGroupToHandle(group([item('downloading')]), null).actions).toEqual([]);
  });

  it('compte les types de probleme et signale les médias VO non listés', () => {
    const items = [
      upgradeGroupToHandle(group([item('pending')]), null),
      upgradeGroupToHandle(group([item('waiting_release')], { key: 'b' }), null),
    ];
    const issues = upgradeIssues(items, 12);
    expect(issues.map((issue) => [issue.key, issue.count])).toEqual([['pending', 1], ['waiting_release', 1]]);
    expect(issues[1].label).toContain('+12 non listés');
    const withFailure = upgradeIssues([upgradeGroupToHandle(group([item('failed')]), null), upgradeGroupToHandle(group([item('verified')], { key: 'c' }), null)]);
    expect(withFailure.find((issue) => issue.key === 'failed').bulk.key).toBe('recompute');
    expect(withFailure.find((issue) => issue.key === 'history').bulk.key).toBe('purge');
  });

  it('cherche une release d’un geste pour un film, une série ou une saison, pas épisode par épisode', () => {
    expect(searchTarget(group([item('pending', { scope: 'episode' })]))).toBeNull();
    expect(searchTarget(group([item('pending', { scope: 'episode' }), item('pending', { id: 2, scope: 'season' })]))?.id).toBe(2);
    expect(searchTarget(group([item('pending', { id: 3, scope: 'movie' })]))?.id).toBe(3);
  });
});

describe('alignement des pistes', () => {
  const audit = (id, issues, over = {}) => ({ id, title: `Film ${id}`, media_type: 'movie', issues, has_vf: true, ...over });

  it('propose d’aligner ce qui est corrigeable, sinon de chercher', () => {
    const fixable = auditItemToHandle(audit(1, ['audio_secondary']), null);
    expect(fixable.issue).toBe('audio_secondary');
    expect(fixable.actions.map((action) => action.key)).toEqual(['align']);
    expect(fixable.proposal).toContain('par défaut');
    const noVf = auditItemToHandle(audit(2, ['partial_vf'], { has_vf: false, media_type: 'show', sub_fr_status: 'absent' }), null);
    expect(noVf.actions.map((action) => action.key)).toEqual(['search-vf', 'search-subtitles']);
    expect(noVf.urgency).toBe('low');
  });

  it('groupe par anomalie principale avec l’action groupée sur les corrigeables', () => {
    const issues = auditIssues([audit(1, ['audio_secondary']), audit(2, ['audio_secondary', 'sub_fr_not_default']), audit(3, ['partial_vf'], { has_vf: false })]);
    expect(issues.map((issue) => [issue.key, issue.count, issue.fixable])).toEqual([['audio_secondary', 2, 2], ['partial_vf', 1, 0]]);
    expect(issues[0].bulk.label).toBe('Aligner les 2');
    expect(issues[1].bulk).toBeUndefined();
  });
});

describe('historique des scans', () => {
  const run = { id: 7, status: 'degraded', started_at: '2026-10-10T20:00:00', trigger: 'selection', tasks_scanned: 2, tasks_total: 3, suggestions_found: 1, tasks_errored: 1 };

  it('fait de chaque cycle un événement, avec sa progression en direct', () => {
    const event = scanRunToEvent(run);
    expect(event).toMatchObject({ key: '7', outcome: 'warning', context: 'Sélection manuelle' });
    expect(event.detail).toBe('2 / 3 recherche(s) · 1 suggestion(s) · 1 erreur(s)');
    expect(scanRunToEvent({ ...run, status: 'running' }, { items_scanned: 5, total_items: 9 }).detail).toContain('5 / 9');
  });

  it('détaille un cycle : cause, étiquettes et une étape par média', () => {
    const detail = scanRunDetail({ ...run, error: 'Sonarr injoignable' }, [{ id: 1, title: 'Dune', status: 'found', release_count: 2 }, { id: 2, title: 'Alien', status: 'error' }], '2 min');
    expect(detail.cause).toBe('Sonarr injoignable');
    expect(detail.steps).toEqual([{ label: 'Dune · 2 releases', outcome: 'success' }, { label: 'Alien · Erreur', outcome: 'failed' }]);
    expect(scanItemLabel({ status: 'none' })).toBe('Sans résultat');
  });
});
