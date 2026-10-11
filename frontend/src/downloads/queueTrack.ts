import { Download, Film, Tv } from '@lucide/vue';
import type { TrackAction, TrackItem, TrackState } from '@/components/templates/TrackTemplate.vue';
import type { UnderstandEvent } from '@/components/templates/UnderstandTemplate.vue';
import { extractQuality, historyModeLabel } from '@/downloads/historyFormat';
import { canAct, interventionInfo, isUnmatched, queueDetailPath, requiresIntervention, rowKey, statusKey, statusLabel } from '@/downloads/queueRules';
import { formatBytes } from '@/utils/format';

/* Une ligne de la file (Sonarr / Radarr / direct) lue par le gabarit Suivre. Rien de
   propre a la page : la page choisit les actions, ce module dit comment une ligne se lit. */

/** « S01E13 » pour un épisode Sonarr, sinon rien (le titre de la série se lit à part). */
export function episodeLabel(row: any): string {
  const season = row?.season_number;
  const episode = row?.episode_number;
  if (season == null || episode == null) return '';
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

/** Où en est le téléchargement, dans les mots du gabarit. */
export function trackState(row: any): TrackState {
  if (requiresIntervention(row)) return 'blocked';
  switch (statusKey(row)) {
    case 'downloading': return 'running';
    case 'paused': return 'paused';
    case 'unknown': return 'unknown';
    default: return 'waiting';
  }
}

/** Provenance en une ligne : épisode, demandeur, puis client ou instance. */
function subtitleOf(row: any): string {
  return [
    episodeLabel(row),
    row.origin_label,
    row.instance || row.download_client || 'Téléchargement direct',
  ].filter(Boolean).join(' · ');
}

/** Les actions d'une ligne : débloquer d'abord, retirer en dernier. */
export function queueActions(row: any, busy = false): TrackAction[] {
  const actions: TrackAction[] = [];
  if (requiresIntervention(row)) {
    actions.push({ key: 'manual', label: isUnmatched(row) ? 'Associer' : 'Importer à la main', tone: 'primary' });
  }
  if (canAct(row)) {
    actions.push({ key: 'retry', label: requiresIntervention(row) ? 'Autre release' : 'Relancer', disabled: busy, title: 'Retire ce téléchargement, bloque la release et en cherche une autre' });
    actions.push({ key: 'remove', label: 'Retirer', tone: 'danger', disabled: busy, title: 'Retire ce téléchargement de la file' });
  }
  return actions;
}

export function queueRowToTrack(row: any, busy = false): TrackItem {
  const state = trackState(row);
  const info = state === 'blocked' ? interventionInfo(row) : null;
  const tags = [extractQuality(row), row.size ? formatBytes(row.size) : ''].filter(Boolean);
  return {
    key: rowKey(row),
    work: row.work,
    state,
    title: row.series_title || row.title || row.name || 'Téléchargement',
    subtitle: subtitleOf(row),
    media: row.media || null,
    poster: row.media ? null : row.poster_url || null,
    icon: row.arr_type === 'radarr' ? Film : row.arr_type === 'sonarr' ? Tv : Download,
    tags,
    progress: state === 'blocked' && (row.progress || 0) >= 100 ? null : row.progress ?? null,
    step: info?.badge || statusLabel(row),
    eta: [row.timeleft, row.sizeleft_label].filter(Boolean).join(' · ') || undefined,
    note: row.waiting_reason || (state === 'blocked' ? '' : row.error) || '',
    cause: info ? { headline: info.headline, reasons: info.reasons, hint: info.hint || undefined } : undefined,
    to: queueDetailPath(row),
    actions: queueActions(row, busy),
  };
}

/** Un téléchargement terminé, en événement de la chronologie. */
export function historyToEvent(row: any): UnderstandEvent {
  return {
    key: String(row.id),
    at: row.completed_at,
    outcome: 'success',
    title: row.year ? `${row.title} (${row.year})` : row.title,
    detail: historyModeLabel(row),
    tags: [extractQuality(row)].filter(Boolean),
    context: row.instance_name || row.source || '',
  };
}
