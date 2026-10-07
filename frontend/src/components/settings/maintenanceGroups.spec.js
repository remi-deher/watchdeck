import { describe, expect, it } from 'vitest';
import { groupActions, lastRunLabel } from './maintenanceGroups';

const meta = (extra = {}) => ({ label: 'x', description: 'y', enabled: true, ...extra });

describe('groupActions', () => {
  it('range les actions par intention, zone sensible en dernier', () => {
    const groups = groupActions({
      'clear-image-cache': meta({ color: 'danger' }),
      'warm-images': meta(),
      'retry-failed': meta(),
      'health-check': meta(),
    });
    expect(groups.map((group) => group.key)).toEqual(['sync', 'repair', 'images', 'sensitive']);
    expect(groups[3].actions).toEqual(['clear-image-cache']);
  });

  it('garde une action inconnue dans « Autres » et une action dangereuse en zone sensible', () => {
    const groups = groupActions({ 'retry-failed': meta({ color: 'danger' }), 'nouvelle-action': meta() });
    expect(groups.map((group) => group.key)).toEqual(['other', 'sensitive']);
    expect(groups[0].actions).toEqual(['nouvelle-action']);
    expect(groups[1].actions).toEqual(['retry-failed']);
  });

  it('n’affiche aucun groupe vide', () => {
    expect(groupActions({})).toEqual([]);
  });
});

describe('lastRunLabel', () => {
  const relative = () => 'Il y a 2 h';

  it('dit le dernier passage et son résultat', () => {
    expect(lastRunLabel(meta({ last_run: { status: 'done', finished_at: '2026-10-07T10:00:00Z' } }), false, relative))
      .toEqual({ status: 'active', text: 'OK · il y a 2 h' });
    expect(lastRunLabel(meta({ last_run: { status: 'error', finished_at: '2026-10-07T10:00:00Z' } }), false, relative))
      .toEqual({ status: 'error', text: 'Échec · il y a 2 h' });
  });

  it('distingue « jamais lancée » et « en cours »', () => {
    expect(lastRunLabel(meta(), false, relative).text).toBe('Jamais lancée');
    expect(lastRunLabel(meta({ last_run: { status: 'done' } }), true, relative).text).toBe('En cours');
  });
});
