import { describe, expect, it } from 'vitest';
import { nextRun, nextRunLabel, sortTasks } from './scheduledTasks';

const now = new Date(2026, 9, 8, 10, 0);

describe('sortTasks', () => {
  it('met les échecs en tête, puis les tâches en cours, sans mélanger le reste', () => {
    const tasks = [
      { job: 'a', label: 'A', state: { status: 'complete' } },
      { job: 'b', label: 'B', state: { status: 'failed' } },
      { job: 'c', label: 'C', state: null },
      { job: 'd', label: 'D', state: { status: 'running' } },
    ];
    expect(sortTasks(tasks).map((task) => task.job)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('nextRun', () => {
  it('repart après son intervalle', () => {
    const task = { job: 'w', label: 'W', interval_seconds: 600, state: { finished_at: new Date(2026, 9, 8, 9, 58).toISOString() } };
    expect(nextRunLabel(task, now)).toBe('dans 8 min');
  });

  it('se cale sur l’heure dite pour une tâche quotidienne', () => {
    const task = { job: 'd', label: 'D', settings_unit: 'heure (0-23)', settings_value: 4, settings_minute_value: 0 };
    expect(nextRun(task, now).getDate()).toBe(9);
    expect(nextRunLabel(task, now)).toBe('demain 04:00');
  });

  it('ne promet rien sans dernier passage connu', () => {
    expect(nextRunLabel({ job: 'x', label: 'X', interval_seconds: 60, state: null }, now)).toBe('');
  });
});
