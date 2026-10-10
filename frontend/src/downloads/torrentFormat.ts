import { formatTorrentBytes as formatBytes } from '@/utils/format';

/* Mise en forme des torrents, partagee par le tableau, sa barre de debits et son tiroir
   d'inspection. */

export { formatTorrentBytes as formatBytes } from '@/utils/format';

export function formatSpeed(value: number): string {
  return `${formatBytes(value)}/s`;
}

export { formatEtaSeconds as formatEta } from '@/utils/format';

/** Les clients donnent des secondes, parfois des millisecondes. */
export { formatTimestamp } from '@/utils/format';

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
  if (row.work) return row.work.state === 'paused';
  const state = String(row.status || '').toLowerCase();
  return state.includes('paused') || state.includes('stopped');
}

export function statusClass(row: any): string {
  if (row.work) return ({running: 'active', waiting: 'paused', paused: 'paused', blocked: 'error', completed: 'complete', cancelled: 'complete', unknown: 'paused'} as Record<string,string>)[row.work.state];
  const state = String(row.status || '').toLowerCase();
  if (state.includes('error') || state.includes('missing')) return 'error';
  if (isPaused(row)) return 'paused';
  if (Number(row.progress) >= 100 || state.includes('upload') || state.includes('stalledup')) return 'complete';
  return 'active';
}

export function statusLabel(row: any): string {
  if (row.work) return row.work.state === 'unknown' ? row.work.label : row.work.stage || row.work.label;
  const state = String(row.status || '').toLowerCase();
  if (state.includes('error')) return 'Erreur';
  if (state.includes('missing')) return 'Fichiers manquants';
  if (state.includes('check')) return 'Vérification';
  if (isPaused(row)) return 'En pause';
  if (Number(row.progress) >= 100 || state.includes('upload') || state.includes('stalledup')) return 'En partage';
  if (state.includes('queue')) return 'En attente';
  return 'Téléchargement';
}
