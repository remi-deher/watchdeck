import { mediaDetailPath } from '@/mediaUrl';
import { parseReleaseEpisodeInfo, type ParsedEpisodeInfo } from '@/utils/releaseTitle';

export interface QueueRow {
  instance_id?: number | string | null;
  instance?: string | null;
  queue_id?: number | string | null;
  download_id?: string | null;
  request_id?: number | string | null;
  library_id?: number | string | null;
  linked_request_id?: number | string | null;
  title?: string | null;
  name?: string | null;
  status?: string | null;
  error?: string | boolean | null;
  progress?: number | null;
  tracked_state?: string | null;
  arr_type?: string | null;
  arr_media_id?: number | string | null;
  [key: string]: any;
}

export type QueueStatusKey = 'error' | 'paused' | 'queued' | 'completed' | 'downloading';

/** Identifiant stable d'une ligne, y compris pour un téléchargement direct sans queue_id. */
export function rowKey(row: QueueRow = {}): string {
  return `${row.instance_id || row.instance || 'direct'}:${row.queue_id || row.download_id || row.request_id || row.title || ''}`;
}

/** Une action (relance, retrait) n'est possible que sur un élément suivi par une instance *arr. */
export function canAct(row: QueueRow = {}): boolean {
  return row.instance_id != null && row.queue_id != null;
}

/**
 * Statut normalisé : 'error' | 'paused' | 'queued' | 'completed' | 'downloading'.
 */
export function statusKey(row: QueueRow = {}): QueueStatusKey {
  const value = (row.status || '').toLowerCase();
  if (row.error || value.includes('error') || value.includes('warning') || value.includes('failed')) return 'error';
  if (value.includes('pause')) return 'paused';
  if (value.includes('queue')) return 'queued';
  if ((row.progress || 0) >= 100) return 'completed';
  return 'downloading';
}

const STATUS_LABELS: Record<QueueStatusKey, string> = {
  error: 'Erreur',
  paused: 'En pause',
  queued: 'En file',
  completed: 'Terminé',
  downloading: 'En cours',
};

export function statusLabel(row: QueueRow = {}): string {
  return STATUS_LABELS[statusKey(row)];
}

/** Fichier téléchargé que *arr n'arrive pas à importer (fréquent sur les épisodes « TBA »). */
export function isImportPending(row: QueueRow = {}): boolean {
  return (row.tracked_state || '').toLowerCase() === 'importpending' && canAct(row);
}

/** Téléchargement qu'aucune demande ni entrée de bibliothèque ne réclame. */
export function isUnmatched(row: QueueRow = {}): boolean {
  return row.request_id == null && row.library_id == null && ['sonarr', 'radarr'].includes(row.arr_type || '');
}

/** Erreur Sonarr sur une série connue : l'épisode cible doit être choisi à la main. */
export function needsEpisodeImport(row: QueueRow = {}): boolean {
  return row.arr_type === 'sonarr' && statusKey(row) === 'error' && row.arr_media_id != null;
}

/** Une intervention humaine est nécessaire pour que ce téléchargement aboutisse. */
export function requiresIntervention(row: QueueRow = {}): boolean {
  return isUnmatched(row) || needsEpisodeImport(row) || isImportPending(row) || statusKey(row) === 'error';
}

/** Fiche média correspondante, ou null si le téléchargement n'est rattaché à rien. */
export function queueDetailPath(row: QueueRow = {}): string | null {
  if (row.library_id) return mediaDetailPath({ library_id: row.library_id }, 'library');
  const id = row.request_id || row.linked_request_id;
  return id ? mediaDetailPath({ request_id: id }, 'request') : null;
}

export interface QueueCountsResult {
  downloading: number;
  queued: number;
  paused: number;
  completed: number;
  intervention: number;
  importPending: number;
  blocked: number;
}

/**
 * Compteurs par catégorie, alignés sur les trois groupes affichés par /downloads.
 */
export function queueCounts(rows: QueueRow[] = []): QueueCountsResult {
  const counts: QueueCountsResult = {
    downloading: 0,
    queued: 0,
    paused: 0,
    completed: 0,
    intervention: 0,
    importPending: 0,
    blocked: 0,
  };
  for (const row of rows || []) {
    if (requiresIntervention(row)) {
      counts.intervention += 1;
      if (isImportPending(row)) counts.importPending += 1;
      else counts.blocked += 1;
      continue;
    }
    const sk = statusKey(row);
    if (sk !== 'error') counts[sk] += 1;
  }
  return counts;
}

export interface UseQueueItemResult {
  key: string;
  status: QueueStatusKey;
  label: string;
  isImportPending: boolean;
  isUnmatched: boolean;
  needsEpisodeImport: boolean;
  requiresIntervention: boolean;
  detailPath: string | null;
  episodeInfo: ParsedEpisodeInfo;
}

/** Composable réutilisable pour la ligne de téléchargement. */
export function useQueueItem(row: QueueRow = {}): UseQueueItemResult {
  const key = rowKey(row);
  const status = statusKey(row);
  const label = statusLabel(row);
  const isImportBlocked = isImportPending(row);
  const unmatched = isUnmatched(row);
  const needsEpisode = needsEpisodeImport(row);
  const needsAction = requiresIntervention(row);
  const detailPath = queueDetailPath(row);
  const episodeInfo = parseReleaseEpisodeInfo(row.title || row.name || '');

  return {
    key,
    status,
    label,
    isImportPending: isImportBlocked,
    isUnmatched: unmatched,
    needsEpisodeImport: needsEpisode,
    requiresIntervention: needsAction,
    detailPath,
    episodeInfo,
  };
}
