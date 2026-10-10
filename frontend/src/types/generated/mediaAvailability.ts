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

export interface JourneyOrigin {
  kind: "request" | "arr" | "plex";
  label: string;
}

export interface JourneyStep {
  key: string;
  label: string;
  state: "completed" | "current" | "upcoming" | "error";
  occurred_at: string | null;
}

export interface JourneyExpectation {
  kind: string;
  label: string;
}

export interface JourneyDownload {
  progress: number | null;
  timeleft: string | null;
}

export interface JourneyTracking {
  kind: string;
  label: string;
  since: string | null;
  next_release_at: string | null;
  download: JourneyDownload | null;
}

export interface RequestJourney {
  request_id: number | null;
  origin: JourneyOrigin;
  status: "not_submitted" | "awaiting_submission" | "submitted" | "queued" | "downloading" | "importing" | "awaiting_plex" | "partially_available" | "completed" | "failed" | "removed" | "rejected";
  label: string;
  steps: JourneyStep[];
  blocker: JourneyExpectation | null;
  next_step: JourneyExpectation | null;
  tracking: JourneyTracking | null;
  availability: MediaAvailability;
}

export interface RequestJourneyRecord {
  availability: MediaAvailability;
  journey: RequestJourney;
  [key: string]: unknown;
}

export interface AvailabilityRecord {
  availability: MediaAvailability;
  journey?: RequestJourney | null;
  [key: string]: unknown;
}

export interface MediaDetailResponse {
  media: AvailabilityRecord;
  requests?: RequestJourneyRecord[];
  [key: string]: unknown;
}

export interface AvailabilityPage {
  items: RequestJourneyRecord[];
  [key: string]: unknown;
}
