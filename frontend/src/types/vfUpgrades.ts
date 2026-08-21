import type { LibraryItem, MediaType } from './media';

export interface VfUpgradeRelease {
  guid?: string;
  title?: string;
  size?: number;
  seeders?: number;
  indexer?: string;
  protocol?: string;
  quality?: string;
  custom_format_score?: number;
  rejections?: string[];
  is_french?: boolean;
  indexer_id?: number | string;
  [key: string]: any;
}

export type VfUpgradeStatus =
  | 'pending'
  | 'waiting_release'
  | 'accepted'
  | 'downloading'
  | 'importing'
  | 'awaiting_verification'
  | 'verified'
  | 'failed'
  | 'dismissed'
  | 'grabbed'
  | 'ignored';

export type AuditIssueType =
  | 'audio_secondary'
  | 'forced_sub_not_default'
  | 'sub_fr_not_default'
  | 'partial_vf';

export interface VfUpgradeItem {
  id: number;
  source_type: 'library_item' | 'request';
  source_id: number;
  scope: 'movie' | 'show' | 'season' | 'episode';
  media_type: MediaType;
  season_number?: number | null;
  episode_number?: number | null;
  status: VfUpgradeStatus;
  origin?: 'auto' | 'manual';
  arr_message?: string | null;
  release_count?: number;
  releases_data?: any[];
  current_release_titles?: string[];
  scanned_at?: string | null;
  updated_at?: string | null;
  accepted_at?: string | null;
  media?: LibraryItem | null;
  is_ignored?: boolean;
  [key: string]: any;
}

export interface VfUpgradeSeasonGroup {
  key: string;
  label: string;
  seasonNumber: number | null;
  season_number?: number | null;
  items: VfUpgradeItem[];
  episodes?: VfUpgradeItem[];
  open?: boolean;
}

export interface VfUpgradeGroup {
  key: string;
  source_type: string;
  source_id: number;
  media: LibraryItem | null;
  items: VfUpgradeItem[];
  seasons: VfUpgradeSeasonGroup[];
  releaseCount: number;
}

export interface VfUpgradeMetrics {
  pending: number;
  waiting_release: number;
  in_progress: number;
  failed: number;
  history: number;
}

export interface VfScanState {
  scanning: boolean;
  progress?: number;
  current_title?: string;
  total?: number;
}

export interface VfUpgradeDashboardResponse {
  items: VfUpgradeItem[];
  scan?: VfScanState;
}

export interface VfAuditResponse {
  items: LibraryItem[];
  counts: {
    total: number;
    audio_secondary: number;
    sub_fr_not_default: number;
    forced_sub_not_default: number;
    partial_vf: number;
  };
}
