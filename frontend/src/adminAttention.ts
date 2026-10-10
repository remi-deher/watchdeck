/**
 * Ce qui demande l'attention d'un administrateur.
 *
 * L'ancienne page d'accueil des réglages comptait les sections configurées (« 2 sur
 * 5 ») : elle ne disait ni ce qui était cassé ni quoi faire. Cette liste répond à ces
 * deux questions, classée par gravité, chaque entrée menant à l'écran qui la règle.
 *
 * La fonction est pure : l'accueil, le rail et la barre de l'Administration lui passent
 * ce qu'ils ont déjà en cache (santé des services, tâches planifiées, version, réglages)
 * et en tirent chacun ce qu'il affiche.
 */

export type AttentionSeverity = 'error' | 'warn' | 'info';

/** Groupe de l'espace Administration qui règle le problème (clé de `navigation.ts`). */
export type AttentionArea =
  | 'admin-overview'
  | 'admin-connections'
  | 'admin-acquisition'
  | 'admin-automation'
  | 'admin-notifications'
  | 'admin-requests'
  | 'admin-security'
  | 'admin-system';

export interface AttentionItem {
  key: string;
  severity: AttentionSeverity;
  area: AttentionArea;
  title: string;
  detail: string;
  action: { label: string; to: string };
}

export interface HealthService {
  health?: import("@/types/generated/mediaAvailability").ServiceHealth;
  state?: string;
  message?: string;
  action_url?: string;
  action_label?: string;
  instance_name?: string;
  issues?: Array<{ level: 'warning' | 'error'; message: string }>;
  issue_count?: number;
}

export interface ScheduledTaskState {
  work?: import("@/types").WorkRef;
  job: string;
  label: string;
  state?: { status?: string; last_error?: string | null; finished_at?: string | null } | null;
}

export interface VersionState {
  version?: string;
  is_latest?: boolean;
  latest_release?: { tag_name?: string; name?: string } | null;
}

/** Chiffres de `GET /api/admin/overview` ; un bloc vaut `null` quand le serveur n'a pu le calculer. */
export interface AdminOverview {
  requests?: { pending_approval: number; failed: number } | null;
  conflicts?: { count: number } | null;
  issues?: { open: number } | null;
  notifications?: { queue: number; hold: boolean; sent_7d: number; failed_7d: number; by_day: number[] } | null;
  users?: { total: number; admins: number; moderators: number } | null;
  download_clients?: { total: number; enabled: number } | null;
  storage?: { connections: number; running_transfers: number; blocked_transfers: number } | null;
  images?: { files: number; bytes: number } | null;
  maintenance?: Record<string, { status: string; finished_at: string; log_count?: number }> | null;
}

export interface AttentionSettings {
  plex_url?: string | null;
  public_base_url?: string | null;
  channels: boolean;
}

export interface AttentionInput {
  services?: Record<string, HealthService> | null;
  tasks?: ScheduledTaskState[] | null;
  version?: VersionState | null;
  /** Absent tant que les réglages ne sont pas chargés : rien n'est alors signalé. */
  settings?: AttentionSettings | null;
  /** Chiffres d'activité (demandes, conflits, notifications…) ; absents, rien n'en est dit. */
  overview?: AdminOverview | null;
}

/** Libellé et écran de réglage de chaque service suivi par `/api/health`. */
export const HEALTH_SERVICES: Record<string, { label: string; area: AttentionArea; to: string }> = {
  plex: { label: 'Plex', area: 'admin-connections', to: '/settings/services' },
  sonarr: { label: 'Sonarr', area: 'admin-connections', to: '/settings/services/integrations' },
  radarr: { label: 'Radarr', area: 'admin-connections', to: '/settings/services/integrations' },
  prowlarr: { label: 'Prowlarr', area: 'admin-connections', to: '/settings/services/integrations' },
  seer: { label: 'Seer', area: 'admin-connections', to: '/settings/services/integrations' },
  rss: { label: 'Watchlist Plex', area: 'admin-connections', to: '/settings/services' },
  smtp: { label: 'E-mail', area: 'admin-notifications', to: '/settings/notifications/channels' },
};

const ORDER: Record<AttentionSeverity, number> = { error: 0, warn: 1, info: 2 };

function serviceName(key: string, info: HealthService): string {
  const base = HEALTH_SERVICES[key]?.label || key;
  const instance = info.instance_name?.trim();
  return instance && instance.toLowerCase() !== base.toLowerCase() ? instance : base;
}

/** Une action interne seulement : une URL absolue ne doit pas sortir de l'application.
 *  Les ancres `#tab-…` du serveur designaient les onglets d'une ancienne page de reglages :
 *  elles ne menent plus nulle part, on prefere alors l'ecran propre au service. */
function internalPath(url: string | undefined, fallback: string): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.includes('#tab-')) return fallback;
  return url;
}

/* Les reponses viennent du reseau : un objet a la place d'une liste (erreur, proxy,
   version de l'API) ne doit jamais faire tomber la page qui les affiche. */
function asRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, T>) : {};
}

const many = (count: number, one: string, other: string) => (count > 1 ? other : one);

/**
 * Ce que l'activité de l'instance demande à un administrateur : demandes qui attendent sa
 * validation, conflits, signalements, notifications bloquées. Tiré de l'aperçu serveur, qui
 * peut manquer tout ou partie (bloc `null`) sans que rien ne soit alors affirmé.
 */
function activityAttention(overview: AdminOverview | null | undefined): AttentionItem[] {
  if (!overview) return [];
  const items: AttentionItem[] = [];

  const pending = overview.requests?.pending_approval ?? 0;
  if (pending > 0) {
    items.push({
      key: 'requests-approval',
      severity: 'warn',
      area: 'admin-requests',
      title: `${pending} ${many(pending, 'demande à approuver', 'demandes à approuver')}`,
      detail: 'Elles attendent la validation d’un administrateur avant d’être transmises.',
      action: { label: 'Examiner', to: '/discover/requests' },
    });
  }
  const failed = overview.requests?.failed ?? 0;
  if (failed > 0) {
    items.push({
      key: 'requests-failed',
      severity: 'warn',
      area: 'admin-acquisition',
      title: `${failed} ${many(failed, 'demande en échec', 'demandes en échec')}`,
      detail: 'Leur transmission à Sonarr ou Radarr a échoué.',
      action: { label: 'Voir', to: '/library?status=failed' },
    });
  }
  const blocked = overview.storage?.blocked_transfers ?? 0;
  if (blocked > 0) {
    items.push({
      key: 'storage-blocked',
      severity: 'warn',
      area: 'admin-acquisition',
      title: `${blocked} ${many(blocked, 'transfert bloqué', 'transferts bloqués')}`,
      detail: 'Un transfert de stockage attend une intervention.',
      action: { label: 'Voir', to: '/storage' },
    });
  }
  const issues = overview.issues?.open ?? 0;
  if (issues > 0) {
    items.push({
      key: 'issues-open',
      severity: 'warn',
      area: 'admin-overview',
      title: `${issues} ${many(issues, 'problème signalé', 'problèmes signalés')}`,
      detail: 'Des utilisateurs ont signalé un souci sur un média.',
      action: { label: 'Traiter', to: '/issues' },
    });
  }

  const notifications = overview.notifications;
  if (notifications?.hold) {
    items.push({
      key: 'notifications-hold',
      severity: 'warn',
      area: 'admin-notifications',
      title: 'Envoi des notifications suspendu',
      detail: notifications.queue
        ? `${notifications.queue} ${many(notifications.queue, 'notification attend', 'notifications attendent')} dans la file.`
        : 'Les nouvelles notifications restent dans la file.',
      action: { label: 'Reprendre', to: '/notifications?tab=pending' },
    });
  }
  const unsent = notifications?.failed_7d ?? 0;
  if (unsent > 0) {
    items.push({
      key: 'notifications-failed',
      severity: 'info',
      area: 'admin-notifications',
      title: `${unsent} ${many(unsent, 'notification en échec', 'notifications en échec')} cette semaine`,
      detail: 'Vérifiez le canal concerné dans le journal des envois.',
      action: { label: 'Voir le journal', to: '/notifications' },
    });
  }
  return items;
}

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const [key, info] of Object.entries(asRecord<HealthService>(input.services))) {
    const meta = HEALTH_SERVICES[key];
    if (!meta || !info) continue;
    const name = serviceName(key, info);
    if (info.health ? info.health.state === 'unreachable' : info.state === 'error') {
      items.push({
        key: `service-${key}`,
        severity: 'error',
        area: meta.area,
        title: `${name} ne répond pas`,
        detail: info.message && info.message !== 'OK' ? info.message : 'Injoignable au dernier contrôle.',
        action: { label: 'Corriger', to: internalPath(info.action_url, meta.to) },
      });
    } else if ((info.health ? info.health.state === 'warning' : info.state === 'ok') && Array.isArray(info.issues) && info.issues.length) {
      const count = Math.max(info.issues.length, info.issue_count || 0);
      const hasError = info.issues.some((issue) => issue.level === 'error');
      items.push({
        key: `service-${key}`,
        severity: hasError ? 'error' : 'warn',
        area: meta.area,
        title: `${name} signale ${count} alerte${count > 1 ? 's' : ''}`,
        detail: info.issues[0].message,
        action: { label: 'Voir', to: internalPath(info.action_url, meta.to) },
      });
    } else if (key === 'plex' && (info.health ? ['not_configured', 'disabled'].includes(info.health.state) : info.state && info.state !== 'ok' && info.state !== 'error')) {
      // Plex est le seul service sans lequel l'application ne sert a rien : son absence
      // merite une ligne, celle de Seer ou de Prowlarr non.
      items.push({
        key: 'service-plex',
        severity: 'warn',
        area: 'admin-connections',
        title: 'Plex n’est pas configuré',
        detail: 'La bibliothèque, les demandes et la surveillance VF en dépendent.',
        action: { label: 'Configurer', to: meta.to },
      });
    }
  }

  for (const task of Array.isArray(input.tasks) ? input.tasks : []) {
    if (task.work ? task.work.state !== 'blocked' : task?.state?.status !== 'failed') continue;
    items.push({
      key: `task-${task.job}`,
      severity: 'warn',
      area: 'admin-automation',
      title: `« ${task.label} » a échoué`,
      detail: (task.work?.reason || task.state?.last_error)?.trim() || 'La dernière exécution s’est terminée en erreur.',
      action: { label: 'Voir la tâche', to: '/settings/automation/scheduled-tasks' },
    });
  }

  const settings = input.settings;
  if (settings) {
    if (!settings.public_base_url?.trim()) {
      items.push({
        key: 'config-public-url',
        severity: 'info',
        area: 'admin-security',
        title: 'Adresse publique non définie',
        detail: 'Les liens des notifications pointent vers l’adresse locale.',
        action: { label: 'Renseigner', to: '/settings/security' },
      });
    }
    if (!settings.channels) {
      items.push({
        key: 'config-channels',
        severity: 'info',
        area: 'admin-notifications',
        title: 'Aucun canal de notification actif',
        detail: 'Personne n’est prévenu des demandes ni des sorties.',
        action: { label: 'Activer un canal', to: '/settings/notifications/channels' },
      });
    }
  }

  items.push(...activityAttention(input.overview));

  const version = input.version;
  if (version && typeof version === 'object' && version.is_latest === false && version.latest_release) {
    const tag = version.latest_release.tag_name || version.latest_release.name || '';
    items.push({
      key: 'version-update',
      severity: 'info',
      area: 'admin-system',
      title: tag ? `Version ${tag.replace(/^v/, '')} disponible` : 'Une nouvelle version est disponible',
      detail: version.version ? `Version installée : ${version.version}` : 'Une mise à jour de Watchdeck est publiée.',
      action: { label: 'Voir', to: '/settings/system/version' },
    });
  }

  return items.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/** Nombre d'entrées qui réclament une action (les informations ne comptent pas). */
export function urgentCount(items: AttentionItem[]): number {
  return items.filter((item) => item.severity !== 'info').length;
}

/** Gravité la plus haute d'un groupe, pour la pastille de la barre latérale. */
export function areaSeverity(items: AttentionItem[], area: string): AttentionSeverity | null {
  const own = items.filter((item) => item.area === area);
  if (!own.length) return null;
  return own.reduce<AttentionSeverity>((worst, item) => (ORDER[item.severity] < ORDER[worst] ? item.severity : worst), 'info');
}
