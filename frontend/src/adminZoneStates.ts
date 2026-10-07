import {
  areaSeverity,
  HEALTH_SERVICES,
  type AdminOverview,
  type AttentionItem,
  type AttentionSeverity,
  type HealthService,
  type ScheduledTaskState,
  type VersionState,
} from '@/adminAttention';
import { formatFileSize, formatRelativeDate } from '@/utils/format';

/** Ce que la carte d'une zone dit d'elle-même : une ligne, et un point de couleur. */
export interface ZoneState {
  line: string;
  severity: AttentionSeverity | null;
}

/** Les reglages que les lignes d'etat lisent ; un champ vide n'est jamais invente. */
export interface ZoneSettings {
  require_approval?: boolean;
  quota_movie_limit?: number | null;
  quota_show_limit?: number | null;
  quota_period_days?: number | null;
  vf_upgrade_enabled?: boolean;
  public_base_url?: string | null;
  trusted_proxies?: string | null;
  default_locale?: string | null;
  channels: string[];
}

export interface ZoneStateInput {
  items: AttentionItem[];
  services: Record<string, HealthService>;
  tasks: ScheduledTaskState[];
  version: VersionState | null;
  overview: AdminOverview | null;
  settings: ZoneSettings | null;
}

const plural = (count: number, one: string, other: string) => `${count} ${count > 1 ? other : one}`;

/** Services que le serveur surveille et qui sont réellement en service (ni coupés, ni sans réglage). */
function connectionLine(services: Record<string, HealthService>): string {
  const known = Object.entries(services).filter(([key, info]) => HEALTH_SERVICES[key] && info?.state);
  const used = known.filter(([, info]) => info.state === 'ok' || info.state === 'error');
  if (!used.length) return known.length ? 'Aucun service en service' : 'Vérification en cours…';
  const broken = used.filter(([, info]) => info.state === 'error');
  const names = broken.map(([key, info]) => info.instance_name?.trim() || HEALTH_SERVICES[key].label);
  if (!broken.length) return `${plural(used.length, 'service répond', 'services répondent')}`;
  const failing = names.length > 2 ? `${names.length} services en erreur` : `${names.join(' et ')} en erreur`;
  return `${failing} · ${used.length - broken.length} sur ${used.length} répondent`;
}

function acquisitionLine(overview: AdminOverview | null): string {
  const clients = overview?.download_clients;
  const storage = overview?.storage;
  if (!clients && !storage) return '';
  const parts: string[] = [];
  if (clients) parts.push(clients.total ? plural(clients.enabled, 'client actif', 'clients actifs') : 'Aucun client');
  if (storage?.blocked_transfers) parts.push(plural(storage.blocked_transfers, 'transfert bloqué', 'transferts bloqués'));
  else if (storage?.running_transfers) parts.push(plural(storage.running_transfers, 'transfert en cours', 'transferts en cours'));
  else if (storage?.connections) parts.push(plural(storage.connections, 'connexion de stockage', 'connexions de stockage'));
  return parts.join(' · ');
}

function automationLine(tasks: ScheduledTaskState[], settings: ZoneSettings | null): string {
  const parts: string[] = [];
  if (tasks.length) {
    parts.push(plural(tasks.length, 'tâche', 'tâches'));
    const failed = tasks.filter((task) => task.state?.status === 'failed').length;
    if (failed) parts.push(`${failed} en échec`);
  }
  if (settings) parts.push(settings.vf_upgrade_enabled ? 'VF active' : 'VF désactivée');
  return parts.join(' · ');
}

function notificationsLine(settings: ZoneSettings | null, overview: AdminOverview | null): string {
  if (!settings) return '';
  const channels = settings.channels.length;
  const parts = [channels ? plural(channels, 'canal actif', 'canaux actifs') : 'Aucun canal actif'];
  const notifications = overview?.notifications;
  if (notifications?.hold) parts.push('envoi suspendu');
  else if (notifications?.queue) parts.push(`${notifications.queue} en attente`);
  return parts.join(' · ');
}

function requestsLine(settings: ZoneSettings | null, overview: AdminOverview | null): string {
  if (!settings) return '';
  const parts = [settings.require_approval ? 'Approbation requise' : 'Sans approbation'];
  const period = settings.quota_period_days || 7;
  const quotas: string[] = [];
  if (settings.quota_movie_limit) quotas.push(`${settings.quota_movie_limit} ${settings.quota_movie_limit > 1 ? 'films' : 'film'}`);
  if (settings.quota_show_limit) quotas.push(`${settings.quota_show_limit} ${settings.quota_show_limit > 1 ? 'séries' : 'série'}`);
  parts.push(quotas.length ? `${quotas.join(' + ')} / ${period} j` : 'Pas de quota');
  const pending = overview?.requests?.pending_approval ?? 0;
  if (pending) parts.push(`${pending} à approuver`);
  return parts.join(' · ');
}

function usersLine(overview: AdminOverview | null): string {
  const users = overview?.users;
  if (!users) return '';
  const parts = [plural(users.total, 'compte', 'comptes')];
  if (users.moderators) parts.push(plural(users.moderators, 'modérateur', 'modérateurs'));
  return parts.join(' · ');
}

function securityLine(settings: ZoneSettings | null): string {
  if (!settings) return '';
  const parts = [settings.public_base_url?.trim() ? 'Adresse publique définie' : 'Adresse publique non définie'];
  if (settings.trusted_proxies?.trim()) parts.push('proxys déclarés');
  return parts.join(' · ');
}

function maintenanceLine(overview: AdminOverview | null): string {
  if (!overview) return '';
  const parts: string[] = [];
  if (overview.images) parts.push(`${formatFileSize(overview.images.bytes)} d’images en cache`);
  const warm = overview.maintenance?.['warm-images'];
  parts.push(warm ? `Préchargement ${formatRelativeDate(warm.finished_at).replace(/^I/, 'i')}` : 'Images jamais préchargées');
  return parts.join(' · ');
}

function systemLine(version: VersionState | null): string {
  if (!version?.version) return '';
  const label = version.version.startsWith('v') ? version.version : `v${version.version}`;
  return `${label} · ${version.is_latest === false ? 'mise à jour disponible' : 'à jour'}`;
}

/**
 * La ligne d'état et le point de couleur de chaque zone de l'Administration.
 *
 * Fonction pure : elle ne charge rien. Une zone dont les données manquent (requête en
 * cours, bloc que le serveur n'a pu calculer) a une ligne vide plutôt qu'une affirmation
 * fausse ; la gravité, elle, vient des points « À traiter » rattachés à la zone.
 */
export function zoneStates(input: ZoneStateInput): Record<string, ZoneState> {
  const { items, services, tasks, version, overview, settings } = input;
  const lines: Record<string, string> = {
    'admin-connections': connectionLine(services),
    'admin-acquisition': acquisitionLine(overview),
    'admin-automation': automationLine(tasks, settings),
    'admin-notifications': notificationsLine(settings, overview),
    'admin-requests': requestsLine(settings, overview),
    'admin-users': usersLine(overview),
    'admin-security': securityLine(settings),
    'admin-maintenance': maintenanceLine(overview),
    'admin-system': systemLine(version),
  };
  return Object.fromEntries(
    Object.entries(lines).map(([key, line]) => [key, { line, severity: areaSeverity(items, key) }])
  );
}
