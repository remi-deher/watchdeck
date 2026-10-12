import type { MonitorAttentionItem } from '@/components/templates/monitor/types';

/* Ce qui demande une intervention sur le tableau de bord : le verdict de l'accueil en
 * annonce le total, les points d'attention en montrent le detail, par la meme regle. */

export interface AttentionQueueRow {
  status?: string;
  tracked_state?: string;
  error?: string;
  [key: string]: any;
}

export function blockedQueueRows<T extends AttentionQueueRow>(queue: T[]): T[] {
  return queue.filter((row) => {
    const value = `${row.status || ''} ${row.tracked_state || ''}`.toLowerCase();
    return Boolean(row.error) || ['error', 'warning', 'failed', 'importpending'].some((key) => value.includes(key));
  });
}

/** Pourquoi un telechargement est bloque, en une phrase. */
function blockedReason(row: AttentionQueueRow): string {
  return (
    row.error ||
    row.waiting_reason ||
    ((row.tracked_state || '').toLowerCase() === 'importpending' ? 'Téléchargé, pas encore importé' : 'Téléchargement en erreur')
  );
}

const MAX_BLOCKED_SHOWN = 4;

/**
 * Les points d'attention de l'accueil (gabarit Surveiller) : les telechargements bloques,
 * chacun avec sa cause, puis les demandes en echec. Au-dela de quelques lignes, un seul point
 * resume le reste et mene a la file.
 */
export function dashboardAttentionItems(queue: AttentionQueueRow[], failedCount: number): MonitorAttentionItem[] {
  const blocked = blockedQueueRows(queue);
  const items: MonitorAttentionItem[] = blocked.slice(0, MAX_BLOCKED_SHOWN).map((row) => ({
    key: `queue-${row.id ?? row.queue_id ?? row.title}`,
    severity: 'warn',
    area: 'downloads',
    title: String(row.title || 'Téléchargement'),
    detail: `${row.instance || 'Sonarr / Radarr'} · ${blockedReason(row)}`,
    action: { label: 'Voir la file', to: '/downloads?view=queue&sub=intervention' },
  }));
  if (blocked.length > MAX_BLOCKED_SHOWN) {
    const rest = blocked.length - MAX_BLOCKED_SHOWN;
    items.push({
      key: 'queue-more',
      severity: 'warn',
      area: 'downloads',
      title: `${rest} autre${rest > 1 ? 's' : ''} téléchargement${rest > 1 ? 's' : ''} bloqué${rest > 1 ? 's' : ''}`,
      detail: 'Imports en attente ou téléchargements en erreur.',
      action: { label: 'Voir la file', to: '/downloads?view=queue&sub=intervention' },
    });
  }
  if (failedCount) {
    items.push({
      key: 'failed-requests',
      severity: 'error',
      area: 'library',
      title: `${failedCount} demande${failedCount > 1 ? 's' : ''} en échec`,
      detail: 'Consulter et relancer les demandes concernées.',
      action: { label: 'Voir les demandes', to: '/library?status=failed' },
    });
  }
  return items;
}
