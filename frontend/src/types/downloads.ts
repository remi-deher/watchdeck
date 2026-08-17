export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'warning';

export interface ArrQueueItem {
  id: number | string;
  title: string;
  size?: number;
  sizeleft?: number;
  timeleft?: string;
  estimatedCompletionTime?: string;
  status: string;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  statusMessages?: { title: string; messages: string[] }[];
  errorMessage?: string;
  downloadId?: string;
  protocol?: 'torrent' | 'usenet';
  indexer?: string;
  quality?: { quality?: { name?: string } };
  mediaType?: 'movie' | 'show';
  seriesId?: number;
  movieId?: number;
  episodeId?: number;
}

export interface TorrentItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  state: string;
  num_seeds?: number;
  num_leechs?: number;
  category?: string;
  save_path?: string;
}

export interface TorrentClientInfo {
  name: string;
  type: string;
  connected: boolean;
  active_torrents: number;
  total_torrents: number;
  download_speed: number;
  upload_speed: number;
  // Champs supplémentaires renvoyés par /api/download-clients (liste de configuration),
  // absents du sous-objet par client de /api/downloads/global-stats.
  id?: number | string;
  enabled?: boolean;
  url?: string;
  client_type?: string;
}
