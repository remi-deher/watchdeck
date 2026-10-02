import { formatDateTime } from '@/utils/format';

/* Mise en forme des torrents, partagee par le tableau, sa barre de debits et son tiroir
   d'inspection. */

export function formatBytes(value: number): string {
  const bytes = Number(value || 0);
  if (!bytes) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const rank = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** rank).toFixed(rank > 2 ? 1 : 0)} ${units[rank]}`;
}

export function formatSpeed(value: number): string {
  return `${formatBytes(value)}/s`;
}

export function formatEta(value: number): string {
  const seconds = Number(value || 0);
  if (!seconds || seconds >= 8640000) return '—';
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

/** Les clients donnent des secondes, parfois des millisecondes. */
export function formatTimestamp(val: number | string): string {
  if (!val) return '—';
  let date: number | string = val;
  if (typeof val === 'number') {
    date = val > 1e11 ? val : val * 1000;
  }
  return formatDateTime(date);
}

export function formatTracker(val: string): string {
  if (!val) return '—';
  const first = String(val).split(',')[0].trim();
  try {
    const raw = first.startsWith('http') || first.startsWith('udp') ? first : `http://${first}`;
    const host = new URL(raw).hostname;
    return host || first;
  } catch {
    return first.length > 25 ? first.slice(0, 22) + '...' : first;
  }
}

/** Mode incognito : un nom neutre, avec la fin du vrai titre pour s'y retrouver. */
export function maskTitle(title: string, index: number): string {
  if (!title) return `Linux ISO #${index + 1}`;
  const suffix = title.length > 8 ? title.slice(-6) : title;
  return `Linux ISO #${index + 1} (${suffix})`;
}

export function isPaused(row: any): boolean {
  const state = String(row.status || '').toLowerCase();
  return state.includes('paused') || state.includes('stopped');
}

export function statusClass(row: any): string {
  const state = String(row.status || '').toLowerCase();
  if (state.includes('error') || state.includes('missing')) return 'error';
  if (isPaused(row)) return 'paused';
  if (Number(row.progress) >= 100 || state.includes('upload') || state.includes('stalledup')) return 'complete';
  return 'active';
}

export function statusLabel(row: any): string {
  const state = String(row.status || '').toLowerCase();
  if (state.includes('error')) return 'Erreur';
  if (state.includes('missing')) return 'Fichiers manquants';
  if (state.includes('check')) return 'Vérification';
  if (isPaused(row)) return 'En pause';
  if (Number(row.progress) >= 100 || state.includes('upload') || state.includes('stalledup')) return 'En partage';
  if (state.includes('queue')) return 'En attente';
  return 'Téléchargement';
}
