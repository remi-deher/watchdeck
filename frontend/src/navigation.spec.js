import { describe, expect, it } from 'vitest';
import {
  DESTINATIONS,
  EXPLORER_TABS,
  LIBRARY_TYPE_TABS,
  activeSectionKey,
  explorerTabFor,
  libraryTypeTabFor,
  destinationForPath,
  destinationsFor,
  adminAreasFor,
  isAdminSpace,
  groupedSections,
  libraryTypeFilters,
  sectionsFor,
} from './navigation';

const ctx = (over = {}) => ({
  isAdmin: true,
  canModerate: true,
  arrInstances: [],
  downloadClients: [],
  ...over,
});

const route = (path, query = {}) => ({ path, query, fullPath: path });
const keys = (sections) => sections.map((section) => section.key);

describe('navigation — destinations', () => {
  it('utilise des clés uniques', () => {
    expect(new Set(DESTINATIONS.map((d) => d.key)).size).toBe(DESTINATIONS.length);
  });

  it('résout la destination depuis le chemin, y compris ses routes annexes', () => {
    expect(destinationForPath('/activity', true, true)?.key).toBe('activity');
    expect(destinationForPath('/analytics', true, true)?.key).toBe('insights');
    expect(destinationForPath('/vf-upgrades', true, true)?.key).toBe('library');
    // Chaque page de reglages releve d'un groupe de l'espace Administration ; les
    // journaux sont rattaches au Systeme depuis la dissolution de l'Exploitation.
    expect(destinationForPath('/logs', true, true)?.key).toBe('admin-system');
    expect(destinationForPath('/notifications', true, true)?.key).toBe('admin-notifications');
    expect(destinationForPath('/settings', true, true)?.key).toBe('admin-overview');
    expect(destinationForPath('/settings/services/webhooks', true, true)?.key).toBe('admin-connections');
    expect(destinationForPath('/users/12', true, true)?.key).toBe('admin-users');
    expect(destinationForPath('/downloads/acquisitions', true, true)?.key).toBe('downloads');
    expect(destinationForPath('/settings/automation/scheduled-tasks', true, true)?.key).toBe('admin-automation');
    expect(destinationForPath('/settings/system/version', true, true)?.key).toBe('admin-system');
    // Le calendrier est une destination a part entiere, et non plus une section d'Explorer.
    expect(destinationForPath('/calendar', false, false)?.key).toBe('calendar');
    expect(destinationForPath('/profile', true, true)).toBeNull();
  });

  it('rattache /issues au tableau de bord pour un admin, mais pas pour un modérateur', () => {
    expect(destinationForPath('/issues', true, true)?.key).toBe('dashboard');
    expect(destinationForPath('/issues', false, true)?.key).toBe('issues');
  });

  it('expose au moins une section par destination, pour ne jamais vider la barre', () => {
    for (const destination of [...destinationsFor(true, true), ...adminAreasFor(true)]) {
      expect(sectionsFor(destination.key, ctx()).length).toBeGreaterThan(0);
    }
  });

  it('regroupe les destinations selon le workflow métier', () => {
    expect(new Set(destinationsFor(true, true).map((d) => d.group))).toEqual(new Set(['Pilotage', 'Explorer', 'Workflow', 'Gestion des médias']));
    expect(new Set(adminAreasFor(true).map((d) => d.group))).toEqual(new Set(['', 'Configurer', 'Gérer']));
  });

  it('réserve les destinations d’administration aux admins', () => {
    const plain = destinationsFor(false, false).map((d) => d.key);
    expect(plain).toContain('discover');
    expect(plain).not.toContain('dashboard');
    expect(plain.filter((key) => key.startsWith('admin'))).toEqual([]);
    expect(adminAreasFor(false)).toEqual([]);
  });

  it('sort l’administration du rail : une porte unique, ses groupes dans un espace à part', () => {
    expect(destinationsFor(true, true).some((d) => d.key.startsWith('admin'))).toBe(false);
    expect(adminAreasFor(true).map((d) => d.key)).toEqual([
      'admin-overview', 'admin-connections', 'admin-automation', 'admin-notifications', 'admin-users', 'admin-system',
    ]);
    expect(isAdminSpace(destinationForPath('/settings/automation', true, true))).toBe(true);
    expect(isAdminSpace(destinationForPath('/downloads', true, true))).toBe(false);
  });

  it('n’affiche « Problèmes signalés » qu’aux modérateurs non-admins', () => {
    expect(destinationsFor(false, true).map((d) => d.key)).toContain('issues');
    expect(destinationsFor(true, true).map((d) => d.key)).not.toContain('issues');
  });
});

describe('navigation — sections', () => {
  it("ne donne plus de sous-entrees a Explorer : ses vues sont des onglets dans la page", () => {
    expect(keys(sectionsFor('discover', ctx()))).toEqual(['home']);
    expect(keys(EXPLORER_TABS)).toEqual(['home', 'movies', 'shows']);
    expect(explorerTabFor('/discover/movies')).toBe('movies');
    expect(explorerTabFor('/discover')).toBe('home');
  });

  it('remplit la barre d’un utilisateur simple sans rien lui cacher', () => {
    const plain = destinationsFor(false, false);
    expect(keys(plain)).toEqual(['discover', 'calendar', 'requests']);
  });

  it('range les types de la Bibliotheque en onglets', () => {
    expect(keys(LIBRARY_TYPE_TABS)).toEqual(['all', 'movie', 'show', 'music']);
    const route = (type) => ({ query: type ? { type } : {} });
    expect(libraryTypeTabFor(route())).toBe('all');
    expect(libraryTypeTabFor(route('movie'))).toBe('movie');
    expect(libraryTypeTabFor(route(['artist', 'album', 'track']))).toBe('music');
    expect(libraryTypeTabFor(route(['movie', 'show']))).toBe('all');
  });

  it('réserve Améliorations VF aux admins dans la Bibliothèque', () => {
    expect(keys(sectionsFor('library', ctx()))).toContain('vf');
    expect(keys(sectionsFor('library', ctx({ isAdmin: false })))).not.toContain('vf');
  });

  it('conserve des sections Acquisition stables indépendamment des instances', () => {
    const sections = sectionsFor(
      'downloads',
      ctx({
        arrInstances: [
          { id: 1, name: 'Radarr HD', arr_type: 'radarr' },
          { id: 4, name: 'Sonarr', arr_type: 'sonarr' },
          { id: 9, name: 'Lidarr', arr_type: 'lidarr' },
        ],
        downloadClients: [{ id: 7, name: 'DATA' }],
      })
    );

    // Films et Series ont fusionne dans la file : c'etaient deux vues filtrees de la
    // meme liste. Le type de media est desormais un filtre, pas une section.
    expect(keys(sections)).toEqual(['overview', 'queue', 'missing', 'clients', 'acquisitions']);
  });

  it('ne transforme pas les instances désactivées en navigation', () => {
    const sections = sectionsFor(
      'downloads',
      ctx({
        arrInstances: [{ id: 1, name: 'Radarr HD', arr_type: 'radarr', enabled: false }],
        downloadClients: [{ id: 7, name: 'DATA', enabled: false }],
      })
    );
    // Films et Series ont fusionne dans la file : c'etaient deux vues filtrees de la
    // meme liste. Le type de media est desormais un filtre, pas une section.
    expect(keys(sections)).toEqual(['overview', 'queue', 'missing', 'clients', 'acquisitions']);
  });

  it('retourne une liste vide pour une destination inconnue', () => {
    expect(sectionsFor('inconnue', ctx())).toEqual([]);
  });

  it('regroupe en conservant l’ordre de première apparition', () => {
    const groups = groupedSections(sectionsFor('admin-connections', ctx()));
    expect(groups.map((g) => g.label)).toEqual(['']);
    expect(keys(groups[0].items)).toEqual(['plex', 'integrations', 'webhooks']);
  });

  it('range les journaux dans le Système et l’historique des envois dans les Notifications', () => {
    expect(keys(sectionsFor('admin-system', ctx()))).toEqual(['data', 'logs', 'version']);
    expect(keys(sectionsFor('admin-notifications', ctx()))).toContain('history');
    for (const destination of adminAreasFor(true)) {
      expect(sectionsFor(destination.key, ctx()).length).toBeGreaterThan(0);
    }
  });
});

describe('navigation — section active', () => {
  it('ouvre les Notifications sur le suivi des envois, file d’attente en tête', () => {
    const notifications = adminAreasFor(true).find((d) => d.key === 'admin-notifications');
    expect(notifications?.to).toBe('/notifications');
    const sections = sectionsFor('admin-notifications', ctx());
    expect(keys(sections).slice(0, 2)).toEqual(['pending', 'history']);
    expect(activeSectionKey(sections, { path: '/notifications', query: { tab: 'pending' } })).toBe('pending');
    expect(activeSectionKey(sections, { path: '/notifications', query: {} })).toBe('history');
    expect(activeSectionKey(sections, { path: '/settings/notifications/rules', query: {} })).toBe('rules');
  });
  it('conserve Catalogue actif quand ?type= change', () => {
    const sections = sectionsFor('library', ctx());
    expect(activeSectionKey(sections, route('/library'))).toBe('catalog');
    expect(activeSectionKey(sections, route('/library', { type: 'show' }))).toBe('catalog');
    expect(activeSectionKey(sections, route('/library', { type: 'album' }))).toBe('catalog');
  });

  it('n’active aucun filtre sur une fiche média', () => {
    const sections = sectionsFor('library', ctx());
    expect(activeSectionKey(sections, route('/library/media/movie/12'))).toBe('');
  });

  it('normalise ?type= répétable', () => {
    expect(libraryTypeFilters(route('/library', { type: ['show', 'movie'] }))).toEqual(['show', 'movie']);
    expect(libraryTypeFilters(route('/library', { type: 'show' }))).toEqual(['show']);
    expect(libraryTypeFilters(route('/library'))).toEqual([]);
  });

  it('préfère la section la plus spécifique à chemin égal', () => {
    const sections = sectionsFor('downloads', ctx({ downloadClients: [{ id: 2, name: 'DATA2' }] }));
    const all = route('/downloads', { view: 'clients', sub: 'instances' });
    const one = route('/downloads', { view: 'clients', sub: 'instances', client: '2' });
    expect(activeSectionKey(sections, all)).toBe('clients');
    expect(activeSectionKey(sections, one)).toBe('clients');
  });

  it('n’active rien quand aucune section ne correspond', () => {
    expect(activeSectionKey(sectionsFor('discover', ctx()), route('/discover/explore'))).toBe('');
  });
});
