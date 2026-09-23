/* Formes des donnees de la page « Ameliorations VF & Flux ».
 *
 * Les suggestions (`VfUpgradeItem`) et leurs regroupements sont deja types dans
 * `utils/vfUpgradeGroups.ts` ; ce fichier couvre l'audit des pistes Plex, les cycles
 * de scan et le detail des series de l'audit. Les champs refletent les reponses de
 * `/api/vf-upgrades/*` et `/api/library/{id}/episodes*`.
 */

export type AuditIssue = 'audio_secondary' | 'sub_fr_not_default' | 'forced_sub_not_default' | 'partial_vf' | string;
export type SubtitleStatus = 'ok' | 'not_default' | 'forced_default' | 'forced_not_default' | 'absent' | 'no_track' | null | undefined;
export type ForcedStatus = 'ok' | 'not_default' | null | undefined;

export interface AuditItem {
  id: number;
  title?: string;
  media_type: 'movie' | 'show' | string;
  year?: number | null;
  poster_url?: string | null;
  has_vf?: boolean;
  fr_is_default?: boolean;
  sub_fr_status?: SubtitleStatus;
  forced_fr_status?: ForcedStatus;
  issues?: AuditIssue[];
}

export interface AuditCounts {
  total: number;
  audio_secondary: number;
  sub_fr_not_default: number;
  forced_sub_not_default: number;
  partial_vf: number;
  [issue: string]: number;
}

/** Correction appliquee a un media d'audit (reponse d'alignement ou evenement SSE). */
export interface StreamsFixPatch {
  has_vf?: boolean;
  fr_is_default?: boolean;
  forced_fr_status?: ForcedStatus;
  sub_fr_status?: SubtitleStatus;
}

export interface ScanRun {
  id: number;
  status: 'running' | 'success' | 'degraded' | 'failed' | string;
  started_at?: string | null;
  finished_at?: string | null;
  [field: string]: unknown;
}

export interface ScanRunItem {
  [field: string]: unknown;
}

export interface LiveScan {
  status?: string;
  [field: string]: unknown;
}

export type EpisodeVfStatus = 'vf' | 'vf_secondary' | 'vo' | 'present' | 'absent' | 'tba' | 'unknown' | string;

export interface AuditEpisode {
  episode: number;
  title?: string;
  status: EpisodeVfStatus;
  tracks: unknown[];
  subtitles: unknown[];
  has_forced_fr_sub: boolean;
  forced_fr_sub_is_default: boolean;
  has_full_fr_sub: boolean;
  full_fr_sub_is_default: boolean;
  has_any_sub_track: boolean;
}

export interface SeasonCounts {
  vf: number;
  vf_secondary: number;
  vo: number;
  present: number;
  absent: number;
  tba: number;
  unknown: number;
  sub_fr_no_track: number;
  sub_fr_absent: number;
  sub_fr_not_default: number;
  forced_fr_not_default: number;
}

export interface AuditSeason {
  season_number: number;
  name?: string;
  episode_count?: number;
  loaded: boolean;
  loading: boolean;
  error: boolean;
  open: boolean;
  counts: SeasonCounts;
  episodes: AuditEpisode[];
}

export interface AuditShowDetail {
  loading: boolean;
  error: boolean;
  seasons: AuditSeason[];
}

/** Disponibilite d'un episode selon *arr (`episodes-availability`). */
export interface EpisodeAvailability {
  has_file?: boolean;
  air_date_utc?: string | null;
}

/** Etat VF d'un episode selon Plex (`episodes-vf-status`). */
export interface EpisodeVfState {
  status?: EpisodeVfStatus;
  has_forced_fr_sub?: boolean;
  forced_fr_sub_is_default?: boolean;
  has_full_fr_sub?: boolean;
  full_fr_sub_is_default?: boolean;
  has_any_sub_track?: boolean;
}

/** Signale un message a l'utilisateur ; `type` vaut « error » pour un echec. */
export type Notify = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
