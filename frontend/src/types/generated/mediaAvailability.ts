// Généré par python -m scripts.generate_availability_types ; ne pas modifier.

export interface ServiceHealth {
  key: string;
  state: "operational" | "configured" | "warning" | "unreachable" | "disabled" | "not_configured" | "unknown";
  label: string;
  reason: string | null;
}

export interface HealthServiceRecord {
  health: ServiceHealth;
  [key: string]: unknown;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "down";
  checked_at: string;
  services: Record<string, HealthServiceRecord>;
}

export interface WorkProgress {
  percent: number | null;
  scope: "step" | "download" | "copy";
  label: string;
}

export interface WorkRef {
  key: string;
  source: "encoding" | "download" | "transfer";
  state: "running" | "waiting" | "paused" | "blocked" | "completed" | "cancelled" | "unknown";
  label: string;
  stage: string | null;
  progress: WorkProgress;
  reason: string | null;
  stale: boolean;
}

export interface WorkRecord {
  work: WorkRef;
  [key: string]: unknown;
}

export interface EncodingStatusResponse {
  configured: boolean;
  runners?: WorkRecord[];
  recent_failed?: WorkRecord[];
  recent_processed?: WorkRecord[];
  [key: string]: unknown;
}

export interface EncodingFilesResponse {
  files: WorkRecord[];
  page: number;
  has_more: boolean;
}

export interface EncodingDiskResponse {
  disk: string;
  running: WorkRecord[];
  [key: string]: unknown;
}

export interface EncodingOverviewResponse {
  disks: EncodingDiskResponse[];
  [key: string]: unknown;
}

export interface ProblemAction {
  key: string;
  label: string;
  tone?: "primary" | "danger" | "default";
  disabled?: boolean;
  title?: string | null;
}

export interface HandlingProblem {
  key: string;
  source: "report" | "request" | "vf_audit";
  kind: string;
  label: string;
  state: "open" | "investigating" | "closed";
  urgency: "high" | "medium" | "low";
  consequence: string;
  proposal: string | null;
  fixable: boolean;
  actions: ProblemAction[];
}

export interface ProblemMedia {
  id: number;
  title: string;
  year: number | null;
  media_type: string;
  poster_url: string | null;
  backdrop_url: string | null;
}

export interface IssueResponse {
  id: number;
  title: string | null;
  media_type: string | null;
  issue_type: string;
  status: string;
  message: string | null;
  created_at: string | null;
  updated_at: string | null;
  reporter_name: string | null;
  admin_note: string | null;
  library_item_id: number | null;
  request_id: number | null;
  poster_url: string | null;
  problem: HandlingProblem;
  media: ProblemMedia | null;
  [key: string]: unknown;
}

export interface IssuesResponse {
  items: IssueResponse[];
  types: string[];
  type_labels: Record<string, string>;
}

export interface AuditProblemRecord {
  id: number;
  title: string;
  media_type: string;
  year: number | null;
  poster_url: string | null;
  backdrop_url: string | null;
  has_vf: boolean | null;
  fr_is_default: boolean | null;
  sub_fr_status: string | null;
  forced_fr_status: string | null;
  issues: string[];
  problems: HandlingProblem[];
  [key: string]: unknown;
}

export interface AuditProblemCounts {
  total: number;
  audio_secondary: number;
  sub_fr_not_default: number;
  forced_sub_not_default: number;
  partial_vf: number;
}

export interface AuditProblemsResponse {
  items: AuditProblemRecord[];
  counts: AuditProblemCounts;
}

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
  problems: HandlingProblem[];
  [key: string]: unknown;
}

export interface AvailabilityRecord {
  availability: MediaAvailability;
  journey?: RequestJourney | null;
  problems?: HandlingProblem[];
  [key: string]: unknown;
}

export interface MediaDetailResponse {
  media: AvailabilityRecord;
  requests?: RequestJourneyRecord[];
  issues?: IssueResponse[];
  [key: string]: unknown;
}

export interface AvailabilityPage {
  items: RequestJourneyRecord[];
  [key: string]: unknown;
}
