// Libellés fr-FR des énumérations du backend, en un seul exemplaire.

/** Statuts réels de `MediaRequest.status`. */
export const REQUEST_STATUSES = [
  'pending_approval',
  'pending',
  'sent_to_arr',
  'partially_available',
  'available',
  'failed',
  'rejected',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Pseudo-statuts propres à la page Bibliothèque fusionnée : un média déjà dans Plex,
 *  ou suivi par Sonarr/Radarr sans demande associée. Pas des `MediaRequest.status`. */
export const KIND_STATUSES = ['library', 'orphan'] as const;
export type KindStatus = (typeof KIND_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  library: 'Dans Plex',
  orphan: 'Suivi Sonarr/Radarr',
  pending_approval: 'À approuver',
  pending: 'En attente',
  sent_to_arr: 'Transmise',
  partially_available: 'Partiellement disponible',
  available: 'Disponible',
  failed: 'Échec',
  rejected: 'Refusée',
};

/**
 * Libellé d'un statut de demande.
 */
export function requestStatusLabel(value?: string | null, fallback?: string): string {
  if (!value) return fallback || '';
  return REQUEST_STATUS_LABELS[value] || fallback || value;
}

/** Libellés courts, pour les badges épinglés sur une affiche. */
export const REQUEST_STATUS_SHORT_LABELS: Record<string, string> = {
  partially_available: 'Partiel',
  orphan: 'Suivi *arr',
};

export function requestStatusShortLabel(value?: string | null, fallback?: string): string {
  if (!value) return fallback || '';
  return REQUEST_STATUS_SHORT_LABELS[value] || requestStatusLabel(value, fallback);
}

/** Film / Série / Musique — types réels de `LibraryItem.media_type` */
const MEDIA_TYPE_LABELS: Record<string, string> = { show: 'Série', artist: 'Musique' };
const MEDIA_TYPE_PLURAL_LABELS: Record<string, string> = { show: 'Séries', artist: 'Musique' };

/** « Film » / « Série » / « Musique » — au singulier, pour une fiche ou une ligne de tableau. */
export function mediaTypeLabel(value?: string | null): string {
  if (!value) return 'Film';
  return MEDIA_TYPE_LABELS[value] || 'Film';
}

/** « Films » / « Séries » / « Musique » — au pluriel, pour un filtre ou un en-tête de section. */
export function mediaTypePluralLabel(value?: string | null): string {
  if (!value) return 'Films';
  return MEDIA_TYPE_PLURAL_LABELS[value] || 'Films';
}

export interface VfLanguageStateResult {
  label: string;
  variant: 'mixed' | 'vf-secondary' | 'vf' | 'vo' | 'unknown';
}

/**
 * Etat du badge de langue VF/VO d'un media (LibraryItem ou MediaRequest) : { label, variant }.
 */
export function vfLanguageState(item: {
  has_vf?: boolean | null;
  fr_is_default?: boolean | null;
  vf_granularity?: string | null;
}): VfLanguageStateResult {
  const isMixed = item.has_vf === false && ['season_partial', 'episode_partial'].includes(item.vf_granularity || '');
  if (isMixed) {
    const label = item.fr_is_default === false ? 'Mixte (VF sec.)' : 'Mixte';
    return { label, variant: 'mixed' };
  }
  const isSecondary = item.has_vf === true && item.fr_is_default === false;
  if (isSecondary) return { label: 'VF (sec.)', variant: 'vf-secondary' };
  if (item.has_vf === true) return { label: 'VF', variant: 'vf' };
  if (item.has_vf === false) return { label: 'VO', variant: 'vo' };
  return { label: '?', variant: 'unknown' };
}

export const PLAYBACK_METHOD_LABELS: Record<string, string> = {
  direct_play: 'Lecture directe',
  direct_stream: 'Direct Stream',
  transcode: 'Transcodage',
};

const PLAYBACK_METHOD_LABELS_COMPACT: Record<string, string> = {
  direct_play: 'Direct Play',
  direct_stream: 'Direct Stream',
  transcode: 'Transcode',
};

export interface PlaybackMethodOptions {
  compact?: boolean;
  fallback?: string;
}

/**
 * Libellé d'un mode de lecture Plex.
 */
export function playbackMethodLabel(
  method?: string | null,
  { compact = false, fallback = 'Lecture' }: PlaybackMethodOptions = {}
): string {
  if (!method) return fallback;
  const table = compact ? PLAYBACK_METHOD_LABELS_COMPACT : PLAYBACK_METHOD_LABELS;
  return table[method] || fallback;
}
