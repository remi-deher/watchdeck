/**
 * Correspondance entre les chemins de réglages et les panneaux qu'ils affichent.
 *
 * Les réglages formaient un troisième niveau de navigation : le rail menait à
 * « Administration », qui menait à « Paramètres », qui portait sa propre colonne de
 * dix-sept entrées. Cette colonne a disparu ; ses groupes sont devenus des zones de
 * l'espace Administration et ses entrées leurs sections, chacune avec son chemin propre —
 * donc partageable et marquable en favori, ce que `?tab=` ne permettait qu'à moitié.
 *
 * Cette table est la source unique du lien chemin → panneau. `navigation.ts` décrit ce
 * que le rail affiche ; ici on dit quoi rendre.
 */

/** Clé de panneau, telle que `SettingsView` la connaît depuis toujours. */
export type SettingsPanel =
  | 'overview'
  | 'plex'
  | 'services'
  | 'webhooks'
  | 'download-clients'
  | 'downloads'
  | 'vf-upgrades'
  | 'subtitles'
  | 'scheduled-tasks'
  | 'acquisitions'
  | 'notifications-channels'
  | 'notifications-rules'
  | 'templates'
  | 'reasons'
  | 'requests'
  | 'network'
  | 'api'
  | 'maintenance'
  | 'data'
  | 'privacy'
  | 'system-version';

/** Chemin canonique de chaque panneau. */
export const PANEL_PATHS: Record<SettingsPanel, string> = {
  overview: '/settings',
  plex: '/settings/services',
  services: '/settings/services/integrations',
  webhooks: '/settings/services/webhooks',
  'download-clients': '/settings/acquisition',
  downloads: '/settings/acquisition/downloads',
  'vf-upgrades': '/settings/automation',
  subtitles: '/settings/automation/subtitles',
  'scheduled-tasks': '/settings/automation/scheduled-tasks',
  acquisitions: '/downloads/acquisitions',
  'notifications-channels': '/settings/notifications/channels',
  'notifications-rules': '/settings/notifications/rules',
  templates: '/settings/notifications/templates',
  reasons: '/settings/notifications/reasons',
  requests: '/settings/requests',
  network: '/settings/security',
  api: '/settings/security/api',
  maintenance: '/settings/maintenance',
  data: '/settings/maintenance/data',
  privacy: '/settings/maintenance/privacy',
  'system-version': '/settings/system/version',
};

const PATH_TO_PANEL = Object.fromEntries(
  Object.entries(PANEL_PATHS).map(([panel, path]) => [path, panel as SettingsPanel])
) as Record<string, SettingsPanel>;

/** Panneau à rendre pour un chemin ; `overview` par défaut. */
export function panelForPath(path: string): SettingsPanel {
  const normalized = path.replace(/\/+$/, '') || '/settings';
  return PATH_TO_PANEL[normalized] || 'overview';
}

/**
 * Anciens noms de `?tab=` qui ne sont plus des clés de panneau : ils sortent des e-mails,
 * des redirections du serveur et des assistants d'installation (`/setup/wizard` renvoie
 * `?tab=connections`).
 */
const LEGACY_TAB_ALIASES: Record<string, SettingsPanel> = {
  connections: 'plex',
  connexions: 'plex',
  notifications: 'notifications-channels',
};

/**
 * Chemin canonique d'un ancien `?tab=`.
 *
 * Les liens `/settings?tab=scheduled-tasks` circulent dans les favoris, les captures et
 * les échanges : ils doivent continuer d'atterrir au bon endroit plutôt que sur la page
 * d'accueil des réglages.
 */
export function pathForLegacyTab(tab: string | null | undefined): string | null {
  if (!tab) return null;
  const panel = (PANEL_PATHS[tab as SettingsPanel] ? tab : LEGACY_TAB_ALIASES[tab]) as SettingsPanel | undefined;
  return (panel && PANEL_PATHS[panel]) || null;
}
