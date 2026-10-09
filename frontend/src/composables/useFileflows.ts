/* FileFlows : types, requete d'etat partagee et libelles.
 *
 * L'accueil, la page Encodage et la fiche media lisent le meme `/api/fileflows/status` :
 * une seule cle, un seul cache, et l'evenement temps reel `fileflows.updated` les
 * rafraichit ensemble. */
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { queryKeys } from '@/queryKeys';

export interface FileflowsMedia {
  id: number;
  title: string;
  year?: number | null;
  media_type: string;
  poster_url?: string | null;
  /** Fond paysage (fanart) : le bandeau « En cours » s'en sert en grand format. */
  backdrop_url?: string | null;
}

export interface FileflowsTiming {
  /** Duree affichee par FileFlows : depuis la prise du fichier par un runner. */
  total_seconds: number;
  /** Temps passe a attendre que le disque se libere (verrou du flow). */
  wait_seconds: number;
  /** Vrai temps de traitement : total moins l'attente. */
  processing_seconds: number;
  kind?: ProcessingKind | null;
  steps: Array<{ name: string; seconds: number; output: number | null }>;
}

export interface FileflowsFile {
  uid: string;
  name: string;
  library: string;
  flow: string;
  node: string;
  status: number;
  status_label: string;
  failure_reason: string;
  original_size: number | null;
  final_size: number | null;
  duration: string | null;
  date: string | null;
  tags: string[];
  media?: FileflowsMedia | null;
  timing?: FileflowsTiming | null;
  relaunched?: boolean;
}

export interface FileflowsRunner {
  path: string;
  name: string;
  library: string;
  step: string;
  percent: number;
  media?: FileflowsMedia | null;
}

export interface FileflowsStatus {
  configured: boolean;
  connected?: boolean;
  error?: string;
  instance?: { id: number; name: string; url: string };
  queue?: number;
  processing?: number;
  processed?: number;
  failed?: number;
  time?: string | null;
  paused?: boolean;
  paused_until?: string | null;
  runners?: FileflowsRunner[];
  recent_failed?: FileflowsFile[];
  recent_processed?: FileflowsFile[];
}

export const FILEFLOWS_STATUS = { queued: 0, processed: 1, processing: 2, failed: 4 } as const;

export function fileflowsStatusQuery() {
  return {
    queryKey: queryKeys.fileflows.status,
    queryFn: ({ signal }: { signal?: AbortSignal }) => api<FileflowsStatus>('/api/fileflows/status', { signal }),
    staleTime: 5_000,
    // Un traitement avance en continu : on suit la progression tant que la page est ouverte.
    refetchInterval: 15_000,
  };
}

/* Etat partage, rafraichi par `fileflows.updated`. */
export function useFileflowsStatus() {
  const queryClient = useQueryClient();
  const query = useQuery(fileflowsStatusQuery());
  useRealtime(['fileflows.updated'], () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all }, { cancelRefetch: false });
  });
  const status = computed<FileflowsStatus | null>(() => query.data.value || null);
  return { query, status };
}

export function fileStatusTone(status: number): string {
  if (status === FILEFLOWS_STATUS.processed) return 'success';
  if (status === FILEFLOWS_STATUS.processing) return 'info';
  if (status === FILEFLOWS_STATUS.failed || status === 3 || status === 6) return 'danger';
  if (status === FILEFLOWS_STATUS.queued) return 'neutral';
  return 'warning';
}

/** Nom du fichier sans ses dossiers, plus lisible dans une liste. */
export function fileBaseName(path: string): string {
  return (path || '').split('/').filter(Boolean).pop() || path;
}

/** Duree lisible : « 42 s », « 4 min 42 », « 1 h 03 ». */
export function formatSeconds(value: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(value) || 0));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min ${String(total % 60).padStart(2, '0')}`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** Gain (negatif) ou perte de taille apres traitement, en pourcentage. */
export function sizeChange(file: Pick<FileflowsFile, 'original_size' | 'final_size'>): number | null {
  if (!file.original_size || !file.final_size) return null;
  return Math.round(((file.final_size - file.original_size) / file.original_size) * 100);
}

/* FileFlows branche et actif ? Lu une fois par session d'ecran : la fiche media n'a pas
   a interroger FileFlows pour savoir si elle doit proposer son onglet. */
export function useFileflowsConfigured(enabled: MaybeRefOrGetter<boolean>) {
  const query = useQuery({
    queryKey: ['fileflows', 'configured'] as const,
    queryFn: ({ signal }) => api<Array<{ arr_type?: string; enabled?: boolean }>>('/api/arr-instances', { signal }),
    select: (rows) => (rows || []).some((row) => row.arr_type === 'fileflows' && row.enabled),
    enabled: computed(() => Boolean(toValue(enabled))),
    staleTime: 5 * 60_000,
  });
  return computed(() => Boolean(query.data.value));
}

/* ------------------------------------------------------------ centre de commande */

export type ProcessingKind = 'encode' | 'rewrite' | 'in_place' | 'conform';

export const PROCESSING_KIND_LABELS: Record<ProcessingKind, string> = {
  encode: 'Réencodage',
  rewrite: 'Réécriture',
  in_place: 'Sur place',
  conform: 'Déjà conforme',
};

export interface FileflowsDiskLane {
  disk: string;
  libraries: string[];
  waiting: number;
  running: FileflowsRunner[];
  lock_waiting: number;
  plex_paused: boolean;
  plex_playing: boolean;
}

export interface FileflowsOverview {
  state: { queue: number; processing: number; processed: number; failed: number; paused: boolean; paused_until: string | null };
  disks: FileflowsDiskLane[];
  throughput: { per_hour: number | null; window_minutes: number };
  eta_hours: number | null;
  automations: { reorder: boolean; plex_pause: 'off' | 'all' | 'disk'; runners_mode: 'manual' | 'auto' };
}

export interface FileflowsControl {
  runners_mode: 'manual' | 'auto';
  runners: number;
  max_runners: number;
  plex_pause: 'off' | 'all' | 'disk';
  plex_pause_relaunched: 'follow' | 'ignore';
  plex_resume_minutes: number;
  reorder_enabled: boolean;
  schedule_restricted: boolean;
  schedule_preset: SchedulePreset;
  alert_channels: AlertChannel[];
  channels_ready: Record<AlertChannel, boolean>;
  guard: Record<string, any> | null;
}

export type AlertChannel = 'email' | 'discord' | 'telegram' | 'ntfy' | 'gotify';
export type SchedulePreset = 'always' | 'night' | 'not_evening' | 'daytime' | 'custom';

export function fileflowsControlQuery() {
  return {
    queryKey: [...queryKeys.fileflows.all, 'control'] as const,
    queryFn: ({ signal }: { signal?: AbortSignal }) => api<FileflowsControl>('/api/fileflows/control', { signal }),
    staleTime: 30_000,
  };
}

export const PLEX_PAUSE_LABELS: Record<FileflowsControl['plex_pause'], string> = {
  off: 'Désactivée',
  all: 'Tous les runners',
  disk: 'Disque concerné',
};

/* ------------------------------------------------------------ historique */

export interface FileflowsSummary {
  size?: number | null;
  video?: { codec?: string; height?: number | null; pix_fmt?: string | null } | null;
  audio?: Array<{ codec?: string; title?: string | null }>;
  subtitles?: Array<{ codec?: string; title?: string | null }>;
}

/** Un passage enregistre par Watchdeck (avant / apres, duree reelle). */
export interface FileflowsPass {
  id: number;
  file_uid: string;
  status: 'processed' | 'failed' | string;
  kind: ProcessingKind | null;
  path: string;
  library: string | null;
  disk: string | null;
  flow: string | null;
  library_item_id: number | null;
  ended_at: string;
  processing_seconds: number | null;
  wait_seconds: number | null;
  original_size: number | null;
  final_size: number | null;
  failure_reason: string | null;
  before: FileflowsSummary | null;
  after: FileflowsSummary | null;
}

export interface FileflowsStats {
  days: number;
  processed: number;
  failed: number;
  saved_bytes: number;
  average_seconds: number | null;
  per_day: Array<{ day: string; processed: number; failed: number }>;
  kinds: Record<string, number>;
  disks: Array<{ disk: string; count: number; average_seconds: number; average_wait_seconds: number }>;
  steps: Array<{ name: string; count: number; average_seconds: number }>;
}

/** Bilan des `days` jours finissant `offset` jours avant maintenant, et derniers passages. */
export function fileflowsHistoryQuery(days: MaybeRefOrGetter<number>, offset: MaybeRefOrGetter<number> = 0, recentLimit = 50) {
  return {
    queryKey: computed(() => [...queryKeys.fileflows.all, 'history', toValue(days), toValue(offset), recentLimit] as const),
    queryFn: ({ signal }: { signal?: AbortSignal }) => api<{ stats: FileflowsStats; recent: FileflowsPass[] }>(
      `/api/fileflows/history?days=${toValue(days)}&offset=${toValue(offset)}&recent_limit=${recentLimit}`,
      { signal },
    ),
    staleTime: 60_000,
  };
}

/** Ce qui a change entre avant et apres : codec video, codecs audio, sous-titres texte, taille. */
const CODEC_NAMES: Record<string, string> = { eac3: 'E-AC3', ac3: 'AC3', dts: 'DTS', truehd: 'TrueHD', aac: 'AAC', opus: 'Opus', flac: 'FLAC', mp3: 'MP3', pcm_s16le: 'PCM', pcm_s24le: 'PCM' };
const codecName = (codec: string) => CODEC_NAMES[codec] || codec.toUpperCase();

/** Ce qui a ete retouche, en etiquettes courtes (« Vidéo », « Audio DTS », « Sous-titres
    SRT », « Pistes renommées »…), deduites de l'avant / apres du passage. */
export function passTags(pass: FileflowsPass): string[] {
  const before = pass.before || {}, after = pass.after;
  if (!after || pass.status === 'failed') return [];
  const tags: string[] = [];
  const bv = before.video, av = after.video;
  if (bv?.codec && av?.codec && (bv.codec !== av.codec || bv.pix_fmt !== av.pix_fmt || bv.height !== av.height)) tags.push('Vidéo');
  /* Un codec audio qui ne se retrouve plus apres a ete converti (ou retire). */
  const kept = new Set((after.audio || []).map((a) => a.codec));
  const converted = new Set((before.audio || []).filter((a) => a.codec && !kept.has(a.codec)).map((a) => codecName(a.codec!)));
  for (const codec of converted) tags.push(`Audio ${codec}`);
  const srt = (s: FileflowsSummary) => (s.subtitles || []).filter((t) => t.codec === 'subrip').length;
  if (srt(before) > srt(after)) tags.push('Sous-titres SRT');
  const count = (s: FileflowsSummary) => (s.audio || []).length + (s.subtitles || []).length;
  if (count(after) < count(before)) tags.push('Pistes retirées');
  const titles = (s: FileflowsSummary) => [...(s.audio || []), ...(s.subtitles || [])].map((t) => t.title || '').join('|');
  if (count(after) === count(before) && titles(before) !== titles(after)) tags.push('Pistes renommées');
  return tags;
}

export function passChanges(pass: FileflowsPass): string[] {
  const before = pass.before || {}, after = pass.after;
  if (!after) return [];
  const out: string[] = [];
  if (before.video?.codec && after.video?.codec && before.video.codec !== after.video.codec) out.push(`Vidéo ${before.video.codec} → ${after.video.codec}`);
  const audio = (s: FileflowsSummary) => (s.audio || []).map((a) => a.codec).join('+');
  if (audio(before) && audio(before) !== audio(after)) out.push(`Audio ${audio(before)} → ${audio(after)}`);
  const srt = (s: FileflowsSummary) => (s.subtitles || []).filter((t) => t.codec === 'subrip').length;
  if (srt(before) > srt(after)) out.push(`${srt(before) - srt(after)} SRT → ASS`);
  if (pass.original_size && pass.final_size && pass.original_size !== pass.final_size) {
    const delta = Math.round(((pass.final_size - pass.original_size) / pass.original_size) * 100);
    out.push(`taille ${delta > 0 ? '+' : ''}${delta} %`);
  }
  return out;
}
