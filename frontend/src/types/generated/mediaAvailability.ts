// Généré par python -m scripts.generate_availability_types ; ne pas modifier.

export interface EpisodeCoverage {
  source: "arr";
  state: "unknown" | "absent" | "partial" | "up_to_date";
  available: number | null;
  aired: number | null;
  total: number | null;
  seasons_available: number | null;
  seasons_total: number | null;
}

export interface MediaLanguages {
  has_vf: boolean | null;
  vf_granularity: string | null;
  fr_is_default: boolean | null;
  sub_fr_status: "absent" | "default" | "not_default" | "ok" | "forced_default" | "forced_not_default" | "no_track" | null;
  forced_fr_status: "none" | "ok" | "not_default" | "absent" | null;
}

export interface MediaQuality {
  source: "plex" | "unknown";
  resolution: string | null;
}

export interface MediaAvailability {
  plex: "present" | "absent" | "unknown";
  library_id: number | null;
  episodes: EpisodeCoverage;
  languages: MediaLanguages;
  quality: MediaQuality;
}

export interface AvailabilityRecord {
  availability: MediaAvailability;
  [key: string]: unknown;
}

export interface MediaDetailResponse {
  media: AvailabilityRecord;
  [key: string]: unknown;
}

export interface AvailabilityPage {
  items: AvailabilityRecord[];
  [key: string]: unknown;
}
