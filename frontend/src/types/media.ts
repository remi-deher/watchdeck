export type MediaType = 'movie' | 'show';
export type SubFrStatus = 'absent' | 'default' | 'not_default' | 'forced_default' | 'forced_not_default';
export type ForcedFrStatus = 'none' | 'ok' | 'not_default' | 'absent';
export type VfGranularity = 'full' | 'season_partial' | 'episode_partial' | 'none';

export interface AudioStream {
  id?: number | string;
  index?: number;
  codec?: string;
  language?: string;
  language_code?: string;
  display_title?: string;
  title?: string;
  channels?: number;
  selected?: boolean;
  is_default?: boolean;
  is_fr?: boolean;
}

export interface SubtitleStream {
  id?: number | string;
  index?: number;
  codec?: string;
  language?: string;
  language_code?: string;
  display_title?: string;
  title?: string;
  selected?: boolean;
  is_default?: boolean;
  is_forced?: boolean;
  is_fr?: boolean;
}

export interface EpisodeInfo {
  id?: number;
  rating_key?: string;
  season_number: number;
  episode_number: number;
  title?: string;
  has_vf?: boolean;
  fr_is_default?: boolean;
  sub_fr_status?: SubFrStatus;
  forced_fr_status?: ForcedFrStatus;
  audio_streams?: AudioStream[];
  subtitle_streams?: SubtitleStream[];
}

export interface SeasonInfo {
  season_number: number;
  title?: string;
  episodes_count?: number;
  has_vf_count?: number;
  episodes?: EpisodeInfo[];
}

export interface LibraryItem {
  id: number;
  rating_key?: string;
  title: string;
  original_title?: string;
  year?: number;
  media_type: MediaType;
  poster_url?: string;
  backdrop_url?: string;
  summary?: string;
  has_vf: boolean;
  fr_is_default: boolean;
  sub_fr_status?: SubFrStatus;
  forced_fr_status?: ForcedFrStatus;
  vf_granularity?: VfGranularity;
  audio_streams?: AudioStream[];
  subtitle_streams?: SubtitleStream[];
  seasons?: SeasonInfo[];
  vf_checked_at?: string;
  added_at?: string;
  updated_at?: string;
  issues?: string[];
  [key: string]: any;
}
