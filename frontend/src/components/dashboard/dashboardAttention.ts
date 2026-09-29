/* Ce qui demande une intervention sur le tableau de bord : l'en-tete en annonce le
 * total, le bloc « A traiter » en montre le detail. Une seule regle pour les deux, sinon
 * le chiffre annonce et les lignes affichees finiraient par diverger. */

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

export function attentionTotal(pendingCount: number, queue: AttentionQueueRow[], failedCount: number): number {
  return pendingCount + blockedQueueRows(queue).length + Number(failedCount || 0);
}
