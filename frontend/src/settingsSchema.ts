import { z } from 'zod';

const optionalUrl = z.string().trim().refine(
  value => !value || /^https?:\/\//i.test(value),
  'Saisissez une URL HTTP ou HTTPS valide.',
);
const optionalEmail = z.string().trim().refine(
  value => !value || z.email().safeParse(value).success,
  'Saisissez une adresse e-mail valide.',
);
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
const nullablePositive = z.number().positive().nullable();

// Le serveur reste la source de vérité. Ce schéma valide les champs modifiables les
// plus sensibles avant transport et accepte les champs additionnels du backend.
export const settingsPatchSchema = z.object({
  plex_url: optionalUrl,
  tautulli_url: optionalUrl,
  tracearr_url: optionalUrl,
  seer_url: optionalUrl,
  public_base_url: optionalUrl,
  ntfy_url: optionalUrl,
  gotify_url: optionalUrl,
  gdpr_contact_email: optionalEmail,
  smtp_from: optionalEmail,
  admin_notification_email: optionalEmail,
  tmdb_region: z.string().trim().length(2, 'Le code région doit contenir deux lettres.'),
  seer_mode: z.enum(['observer', 'manager']),
  series_notify_granularity: z.enum(['jalons', 'episodes']),
  watchlist_source_priority: z.enum(['api', 'rss']),
  availability_confirmation_mode: z.enum(['hybrid', 'plex', 'arr']),
  poll_interval_seconds: integer(10, 86_400),
  arr_poll_interval_seconds: integer(10, 86_400),
  arr_queue_interval_seconds: integer(10, 86_400),
  torrent_status_interval_seconds: integer(10, 86_400),
  activity_retention_days: integer(1, 3650),
  digest_hour: integer(0, 23),
  digest_minute: integer(0, 59),
  notification_purge_hour: integer(0, 23),
  vf_upgrade_min_confidence: integer(0, 100),
  vf_upgrade_search_concurrency: integer(1, 20),
  vf_upgrade_max_searches_per_run: integer(1, 1000),
  torrent_min_size_gb: nullablePositive,
  torrent_max_size_gb: nullablePositive,
  torrent_ratio_limit: nullablePositive,
  torrent_seed_time_limit_hours: nullablePositive,
}).partial().catchall(z.unknown()).superRefine((data, ctx) => {
  if (typeof data.torrent_min_size_gb === 'number' && typeof data.torrent_max_size_gb === 'number' && data.torrent_min_size_gb > data.torrent_max_size_gb) {
    ctx.addIssue({ code: 'custom', path: ['torrent_max_size_gb'], message: 'La taille maximale doit être supérieure à la taille minimale.' });
  }
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
