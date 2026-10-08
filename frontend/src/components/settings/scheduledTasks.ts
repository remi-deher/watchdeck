/* Ordre et prochain passage des tâches planifiées : les échecs d'abord, et pour chaque tâche
 * quand elle repartira. Fonctions pures, testées sans monter l'écran. */

export interface TaskState {
  status?: string;
  finished_at?: string | null;
  started_at?: string | null;
}

export interface ScheduledTask {
  job: string;
  label: string;
  interval_seconds?: number;
  settings_unit?: string | null;
  settings_value?: number | null;
  settings_minute_value?: number | null;
  fixed_schedule?: string | null;
  state?: TaskState | null;
}

const RANK: Record<string, number> = { failed: 0, running: 1, complete: 2 };

/** Les échecs en tête, puis les tâches en cours, puis les autres ; l'ordre du catalogue sinon. */
export function sortTasks<T extends ScheduledTask>(tasks: T[]): T[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => (RANK[a.task.state?.status || ''] ?? 3) - (RANK[b.task.state?.status || ''] ?? 3) || a.index - b.index)
    .map(({ task }) => task);
}

/** Prochain passage : à l'heure dite pour une tâche quotidienne, sinon dernier passage + intervalle. */
export function nextRun(task: ScheduledTask, now: Date = new Date()): Date | null {
  if (task.settings_unit === 'heure (0-23)' && typeof task.settings_value === 'number') {
    const next = new Date(now);
    next.setHours(task.settings_value, task.settings_minute_value ?? 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  const last = task.state?.finished_at || task.state?.started_at;
  if (!last || !task.interval_seconds) return null;
  const next = new Date(new Date(last).getTime() + task.interval_seconds * 1000);
  return next < now ? now : next;
}

/** « dans 12 min », « dans 2 h », « demain 04:00 », « imminente ». */
export function nextRunLabel(task: ScheduledTask, now: Date = new Date()): string {
  const next = nextRun(task, now);
  if (!next) return '';
  const minutes = Math.round((next.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return 'imminente';
  if (minutes < 60) return `dans ${minutes} min`;
  if (minutes < 24 * 60 && next.getDate() === now.getDate()) return `dans ${Math.round(minutes / 60)} h`;
  const time = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
  return minutes < 48 * 60 ? `demain ${time}` : next.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ` ${time}`;
}
