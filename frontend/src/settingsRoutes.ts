/**
 * Correspondance entre les chemins de réglages et les panneaux qu'ils affichent.
 *
 * Les réglages formaient un troisième niveau de navigation : le rail menait à
 * « Administration », qui menait à « Paramètres », qui portait sa propre colonne de
 * dix-sept entrées. Cette colonne a disparu ; ses groupes sont devenus des destinations
 * et ses entrées leurs sections, chacune avec son chemin propre — donc partageable et
 * marquable en favori, ce que `?tab=` ne permettait qu'à moitié.
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
  | 'downloads'
  | 'vf-upgrades'
  | 'scheduled-tasks'
  | 'acquisitions'
  | 'notifications-channels'
  | 'notifications-rules'
  | 'templates'
  | 'reasons'
  | 'data'
  | 'system-version';

/** Chemin canonique de chaque panneau. */
export const PANEL_PATHS: Record<SettingsPanel, string> = {
  overview: '/settings',
  plex: '/settings/services',
  services: '/settings/services/integrations',
  webhooks: '/settings/services/webhooks',
  downloads: '/settings/automation',
  'vf-upgrades': '/settings/automation/vf-upgrades',
  'scheduled-tasks': '/settings/automation/scheduled-tasks',
  acquisitions: '/settings/operations',
  'notifications-channels': '/settings/notifications/channels',
  'notifications-rules': '/settings/notifications/rules',
  templates: '/settings/notifications/templates',
  reasons: '/settings/notifications/reasons',
  data: '/settings/system',
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
 * Chemin canonique d'un ancien `?tab=`.
 *
 * Les liens `/settings?tab=scheduled-tasks` circulent dans les favoris, les captures et
 * les échanges : ils doivent continuer d'atterrir au bon endroit plutôt que sur la page
 * d'accueil des réglages.
 */
export function pathForLegacyTab(tab: string | null | undefined): string | null {
  if (!tab) return null;
  return PANEL_PATHS[tab as SettingsPanel] || null;
}
