import { computed, reactive, ref } from 'vue';
import { api } from '@/api';

export const secretFields = [
  'plex_token',
  'tautulli_api_key',
  'tracearr_api_key',
  'seer_api_key',
  'tmdb_api_key',
  'discord_webhook_url',
  'telegram_bot_token',
  'ntfy_token',
  'gotify_token',
] as const;

export type SecretField = (typeof secretFields)[number];

export const form = reactive<Record<string, any>>({
  plex_url: '',
  plex_token: '',
  plex_verify_ssl: true,
  plex_rss_url: '',
  live_activity_enabled: true,
  activity_retention_days: 365,
  activity_anonymize_ips: true,
  tautulli_enabled: false,
  tautulli_url: '',
  tautulli_api_key: '',
  tracearr_enabled: false,
  tracearr_url: '',
  tracearr_api_key: '',
  seer_enabled: false,
  seer_url: '',
  seer_api_key: '',
  seer_mode: 'observer',
  seer_send_requests: false,
  seer_fallback_arr: false,
  seer_suppress_notifications: true,
  tmdb_api_key: '',
  tmdb_enabled: true,
  tmdb_region: 'FR',
  webhook_secret: '',
  public_base_url: '',
  gdpr_contact_name: '',
  gdpr_contact_email: '',
  email_enabled: false,
  smtp_from: '',
  admin_notification_email: '',
  notify_import_blocked: true,
  email_on_request: true,
  email_on_available: true,
  email_on_failure: true,
  email_on_vf_available: true,
  discord_enabled: false,
  discord_webhook_url: '',
  discord_send_request: true,
  discord_send_available: true,
  discord_send_failure: true,
  telegram_enabled: false,
  telegram_bot_token: '',
  telegram_chat_id: '',
  telegram_send_request: true,
  telegram_send_available: true,
  telegram_send_failure: true,
  ntfy_enabled: false,
  ntfy_url: '',
  ntfy_topic: '',
  ntfy_token: '',
  ntfy_send_request: true,
  ntfy_send_available: true,
  ntfy_send_failure: true,
  gotify_enabled: false,
  gotify_url: '',
  gotify_token: '',
  gotify_send_request: true,
  gotify_send_available: true,
  gotify_send_failure: true,
  movie_notify_language: true,
  series_notify_language: true,
  series_notify_granularity: 'jalons',
  poll_interval_seconds: 300,
  watchlist_source_priority: 'api',
  watchlist_fallback_enabled: true,
  require_approval: false,
  vff_enabled: true,
  vff_libraries: '',
  vff_recheck_interval_minutes: 60,
  vff_auto_search: false,
  vf_upgrade_enabled: true,
  vf_upgrade_include_vo: true,
  vf_upgrade_include_mixed: true,
  vf_upgrade_include_vf: false,
  vf_upgrade_cooldown_hours: 24,
  vf_upgrade_max_searches_per_run: 40,
  vf_upgrade_search_concurrency: 3,
  vf_upgrade_search_stagger_ms: 0,
  vf_upgrade_retry_hours: 6,
  vf_upgrade_priority: 'mixed,vo,vf',
  vf_upgrade_prioritize_continuing: false,
  vf_upgrade_markers: 'truefrench,vff,multi,vfi,vfq',
  vf_upgrade_preference: 'truefrench,vff,multi,vfi,vfq',
  vf_upgrade_accept_secondary: true,
  vf_upgrade_require_default: false,
  vf_upgrade_min_confidence: 65,
  vf_upgrade_block_arr_rejected: true,
  vf_upgrade_protect_resolution: true,
  vf_upgrade_preserve_hdr: true,
  vf_upgrade_protect_custom_format_score: true,
  vf_upgrade_min_size_gb: null,
  vf_upgrade_max_size_gb: null,
  vf_upgrade_allow_technical_downgrade: false,
  vf_upgrade_verify_after_import: true,
  vf_upgrade_verification_timeout_minutes: 120,
  vf_upgrade_trigger_plex_scan: true,
  vf_upgrade_max_retries: 3,
  vf_upgrade_blacklist_failed: true,
  vf_upgrade_mixed_mode: 'episodes',
  vf_upgrade_episodic_fallback: true,
  vf_upgrade_episodic_fallback_limit: 5,
  vf_upgrade_episodic_fallback_days: 30,
  vf_upgrade_no_result_backoff_base_hours: 6,
  vf_upgrade_no_result_backoff_max_hours: 48,
  vf_upgrade_protect_existing_vf: true,
  vf_upgrade_notify_found: false,
  vf_upgrade_notify_accepted: false,
  vf_upgrade_notify_downloading: false,
  vf_upgrade_notify_failed: true,
  vf_upgrade_notify_verified: true,
  vf_upgrade_history_retention_days: 90,
  notification_log_retention_days: 30,
  poll_history_retention_days: 30,
  arr_poll_interval_seconds: 900,
  arr_queue_interval_seconds: 60,
  torrent_status_interval_seconds: 120,
  new_vff_interval_seconds: 60,
  seer_sync_interval_minutes: 60,
  library_analytics_interval_minutes: 10,
  notification_purge_hour: 3,
  digest_enabled: false,
  digest_hour: 8,
  digest_minute: 0,
  login_attempt_retention_days: 90,
  audit_log_retention_days: null,
  plex_sync_interval_hours: 24,
  plex_sync_recent_interval_minutes: 5,
  torrent_required_keywords: '',
  torrent_forbidden_keywords: '',
  torrent_min_size_gb: null,
  torrent_max_size_gb: null,
  torrent_ratio_limit: null,
  torrent_seed_time_limit_hours: null,
  torrent_auto_delete_files: false,
  availability_confirmation_mode: 'hybrid',
  availability_confirmation_timeout_minutes: 30,
});

export const saving = ref(false);
export const error = ref('');
export const message = ref('');

/* Etat du formulaire tel qu'il a ete charge, champ par champ.
 *
 * Conserve comme objet et non comme chaine JSON : c'est ce qui permet de savoir *quels*
 * champs ont change, et donc de n'envoyer que ceux-la. Les reglages sont desormais
 * repartis sur plusieurs pages ; envoyer les cent trente-six champs a chaque
 * enregistrement, comme avant, avait deux consequences facheuses. D'abord une page
 * reecrivait des reglages qu'elle n'affiche meme pas. Ensuite, deux administrateurs
 * modifiant deux sections differentes se marchaient dessus : le second enregistrement
 * ecrasait le premier avec sa propre copie, vieille du chargement de page.
 *
 * N'envoyer que le change resout les deux : la charge tombe a un ou deux champs, et
 * deux modifications portant sur des sections distinctes ne peuvent plus se detruire.
 */
const savedSnapshot = ref<Record<string, any> | null>(null);

/** Champs dont la valeur differe de celle chargee. */
export function changedFields(): string[] {
  const base = savedSnapshot.value;
  if (!base) return [];
  return Object.keys(form).filter((key) => !Object.is(form[key], base[key]));
}

export const isDirty = computed(() => {
  // La lecture de `form` doit rester tracee par Vue : passer par `changedFields()` seul
  // ne creerait aucune dependance reactive sur les champs inchangés.
  const base = savedSnapshot.value;
  if (!base) return false;
  return Object.keys(form).some((key) => !Object.is(form[key], base[key]));
});

export const secretsPresent = reactive<Record<string, boolean>>(
  Object.fromEntries(secretFields.map((k) => [k, false]))
);

export function success(text: string): void {
  message.value = text;
  error.value = '';
}

export function fail(err: any): void {
  error.value = err?.message || String(err);
}

export async function load(): Promise<void> {
  try {
    const data = await api<Record<string, any>>('/api/settings');
    for (const key of Object.keys(form)) {
      if (data[key] != null) form[key] = data[key];
    }
    for (const key of secretFields) {
      secretsPresent[key] = Boolean(form[key]);
      form[key] = '';
    }
    // Reference prise apres l'effacement des secrets : un secret non saisi vaut donc la
    // chaine vide des deux cotes et ne compte pas comme une modification.
    savedSnapshot.value = { ...form };
  } catch (e) {
    fail(e);
  }
}

export async function save(): Promise<void> {
  const changed = changedFields();
  if (!changed.length) {
    success('Aucune modification à enregistrer.');
    return;
  }

  saving.value = true;
  const payload: Record<string, any> = {};
  for (const key of changed) {
    // Un secret laisse vide signifie « conserver l'existant », pas « effacer ».
    if (secretFields.includes(key as SecretField) && !form[key]) continue;
    payload[key] = form[key];
  }

  try {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
    for (const key of Object.keys(payload)) {
      if (savedSnapshot.value) savedSnapshot.value[key] = form[key];
    }
    // Un secret vient d'etre enregistre : le champ se vide et l'interface indique
    // desormais qu'une valeur est configuree.
    for (const key of secretFields) {
      if (payload[key]) {
        secretsPresent[key] = true;
        form[key] = '';
        if (savedSnapshot.value) savedSnapshot.value[key] = '';
      }
    }
    success('Configuration enregistrée.');
  } catch (e) {
    fail(e);
  } finally {
    saving.value = false;
  }
}

export async function testSaved(path: string): Promise<any> {
  await save();
  try {
    const data = await api<any>(path, { method: 'POST' });
    success(data.message || 'Connexion valide.');
    return data;
  } catch (e) {
    fail(e);
    return null;
  }
}
