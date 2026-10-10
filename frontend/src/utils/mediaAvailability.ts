import type { MediaAvailability } from '@/types/media';

export interface AvailabilityLike {
  availability?: MediaAvailability | null;
  in_library?: boolean;
  library_id?: number | string | null;
  library_item_id?: number | string | null;
  available?: boolean;
  requested?: boolean;
  request_id?: number | string | null;
  request_status?: string | null;
  status?: string | null;
  is_downloading?: boolean;
}

/** La présence Plex vient du serveur. Compatibilité avec les anciennes réponses. */
export function isInPlex(item: AvailabilityLike): boolean {
  if (item.availability) return item.availability.plex === 'present';
  return Boolean(item.in_library || item.library_id || item.library_item_id || item.available || item.request_status === 'available');
}

export function mediaAvailabilityBadge(item: AvailabilityLike | null | undefined): { label: string; variant: string } | null {
  if (!item) return null;
  const raw = item.request_status || item.status;
  if (item.availability) {
    if (isInPlex(item)) return { label: 'Dans Plex', variant: 'in-plex' };
    if (raw === 'available') return { label: 'À confirmer dans Plex', variant: 'partial' };
    if (item.availability.episodes.state === 'partial') return { label: 'Fichiers partiels · *ARR', variant: 'partial' };
  } else {
    // Un ancien booléen available inclut aussi la disponibilité partielle.
    if (raw === 'partially_available') return { label: 'Partiellement disponible', variant: 'partial' };
    if (isInPlex(item) || raw === 'available') return { label: 'Dans Plex', variant: 'in-plex' };
  }
  if (item.is_downloading || raw === 'downloading') return { label: 'En téléchargement', variant: 'downloading' };
  if (raw === 'pending_approval') return { label: 'À approuver', variant: 'partial' };
  if (raw === 'failed') return { label: 'Échec', variant: 'error' };
  if (raw === 'sent_to_arr') return { label: 'Transmise', variant: 'sent' };
  if (item.requested || item.request_id || raw) return { label: 'Demandé', variant: 'requested' };
  return null;
}
