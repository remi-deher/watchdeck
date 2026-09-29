/**
 * État de notification d'un co-demandeur pour l'évènement courant.
 * @returns `true` notifié, `false` pas encore, `null` rien à notifier.
 */
export function notifiedStatus(row: any, uid: string | number): boolean | null {
  const notified = row.requester_notifications?.[uid];
  if (!notified) return null;
  return row.status === 'available' ? notified.available : notified.request;
}

/** Au moins un co-demandeur attend encore sa notification. */
export function hasUnnotified(row: any): boolean {
  return (row.requester_ids || []).some((uid: string | number) => notifiedStatus(row, uid) === false);
}

/**
 * La demande peut-elle être clôturée manuellement ?
 * Une demande déjà disponible reste clôturable tant qu'elle est suivie pour une
 * amélioration VF — c'est justement la clôture qui arrête ce suivi.
 */
export function canClose(row: any): boolean {
  return row.status !== 'available' || (row.has_vf !== true && !row.vf_tracking_disabled);
}

/** « 3/8 completes » — avancement par saison d'une série. */
export function seasonsSummary(seasons: any[]): string {
  const available = seasons.filter((season) => season.status === 'available').length;
  return `${available}/${seasons.length} completes`;
}

export type MailState = 'sent' | 'pending' | 'none';

/**
 * Où en est un demandeur pour un mail donné : `sent` reçu, `pending` pas encore
 * reçu alors que l'étape est franchie, `none` rien à recevoir (étape pas atteinte ou
 * aucune adresse connue).
 */
export function mailState(row: any, uid: string | number, event: 'request' | 'available'): MailState {
  if (event === 'available' && !['available', 'partially_available'].includes(row.status)) return 'none';
  // Un média ajouté directement dans *ARR ou déjà présent dans Plex n'a jamais de mail
  // « demande » : l'afficher « en attente » laisserait croire qu'il va partir.
  if (event === 'request' && row.origin_kind && row.origin_kind !== 'request') return 'none';
  const value = row.requester_notifications?.[uid]?.[event];
  if (value === true) return 'sent';
  if (value === false) return 'pending';
  return 'none';
}
