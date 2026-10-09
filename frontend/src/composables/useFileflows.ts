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
