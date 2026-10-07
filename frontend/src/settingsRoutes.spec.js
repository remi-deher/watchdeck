import { describe, expect, it } from 'vitest';
import { PANEL_PATHS, panelForPath, pathForLegacyTab } from './settingsRoutes';
import { SETTINGS_SEARCH_INDEX } from './settingsSearchIndex';
import { adminAreasFor, sectionsFor } from './navigation';

const ctx = { isAdmin: true, canModerate: true, arrInstances: [], downloadClients: [] };
const targetPath = (to) => (typeof to === 'string' ? to : to.path);

describe('settingsRoutes', () => {
  it('donne un chemin unique à chaque panneau, et le retrouve', () => {
    const paths = Object.values(PANEL_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
    for (const [panel, path] of Object.entries(PANEL_PATHS)) expect(panelForPath(path)).toBe(panel);
  });

  it('tolère le slash final et retombe sur l’aperçu pour un chemin inconnu', () => {
    expect(panelForPath('/settings/maintenance/')).toBe('maintenance');
    expect(panelForPath('/settings/inconnu')).toBe('overview');
  });

  it('rend chaque section de l’administration à son panneau, sans la confondre avec l’aperçu', () => {
    // Une section dont le chemin n'est pas dans la table afficherait l'aperçu : on le saurait trop tard.
    for (const area of adminAreasFor(true)) {
      for (const section of sectionsFor(area.key, ctx)) {
        const path = targetPath(section.to);
        if (!path.startsWith('/settings') || path === '/settings') continue;
        expect(panelForPath(path), `${area.key} › ${section.key} (${path})`).not.toBe('overview');
        expect(panelForPath(path)).toBe(Object.keys(PANEL_PATHS).find((panel) => PANEL_PATHS[panel] === path));
      }
    }
  });

  it('indexe des chemins que l’application sait servir', () => {
    const known = new Set([
      ...Object.values(PANEL_PATHS),
      '/users', '/logs', '/storage',
    ]);
    for (const entry of SETTINGS_SEARCH_INDEX) expect(known.has(entry.path), entry.label).toBe(true);
  });

  it('résout les anciens ?tab= vers leur nouvelle place', () => {
    // Ces liens circulent dans les favoris, les e-mails et les redirections du serveur.
    expect(pathForLegacyTab('scheduled-tasks')).toBe('/settings/automation/scheduled-tasks');
    expect(pathForLegacyTab('data')).toBe('/settings/maintenance/data');
    expect(pathForLegacyTab('downloads')).toBe('/settings/acquisition/downloads');
    expect(pathForLegacyTab('connections')).toBe('/settings/services');
    expect(pathForLegacyTab('notifications')).toBe('/settings/notifications/channels');
    expect(pathForLegacyTab('templates')).toBe('/settings/notifications/templates');
    expect(pathForLegacyTab('inconnu')).toBeNull();
    expect(pathForLegacyTab(undefined)).toBeNull();
  });
});
