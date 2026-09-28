import { api } from '@/api';
import { queryKeys } from '@/queryKeys';

/* Requetes lues par plusieurs ecrans : meme cle ET meme fonction de lecture, sinon le
 * cache partage dependrait de l'ecran qui l'a rempli en premier. Chaque ecran y ajoute
 * ce qui lui est propre (`select`, `enabled`...). */

export function playbackLiveQuery() {
  return {
    queryKey: queryKeys.playback.live,
    queryFn: ({ signal }: { signal: AbortSignal }) => api<Record<string, any>>('/api/playback/live', { signal }),
  };
}

export function arrQueueQuery() {
  return {
    queryKey: queryKeys.downloads.arrQueue,
    queryFn: ({ signal }: { signal: AbortSignal }) => api<any>('/api/arr/queue', { signal }),
    staleTime: 5_000,
  };
}

export function diskSpaceQuery() {
  return {
    queryKey: queryKeys.diskSpace,
    queryFn: ({ signal }: { signal: AbortSignal }) => api<any>('/api/disk-space', { signal }),
  };
}

/* Un statut VFF illisible vaut « rien a signaler » : `{}`, comme le faisaient les
 * reglages, plutot qu'une erreur qui masquerait le reste de la page. */
export function vffScanStatusQuery() {
  return {
    queryKey: queryKeys.vff.scanStatus,
    queryFn: ({ signal }: { signal: AbortSignal }) => api<Record<string, any>>('/api/vff/scan-status', { signal }).catch(() => ({})),
  };
}

export function vffSyncStatusQuery() {
  return {
    queryKey: queryKeys.vff.syncStatus,
    queryFn: ({ signal }: { signal: AbortSignal }) => api<Record<string, any>>('/api/vff/sync-status', { signal }).catch(() => ({})),
  };
}

export function vffCountsQuery() {
  return {
    queryKey: queryKeys.vff.counts,
    queryFn: ({ signal }: { signal: AbortSignal }) => api<Record<string, any>>('/api/vff/counts', { signal }).catch(() => ({})),
  };
}

export function downloadsGlobalStatsPath(clientId: string | number | null | undefined): string {
  return `/api/downloads/global-stats${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''}`;
}
