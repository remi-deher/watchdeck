import { describe, expect, it } from 'vitest';
import {
  DESTINATIONS,
  activeSectionKey,
  destinationForPath,
  destinationsFor,
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
    expect(destinationForPath('/analytics')?.key).toBe('activity');
    expect(destinationForPath('/vf-upgrades')?.key).toBe('library');
    expect(destinationForPath('/logs')?.key).toBe('settings');
    expect(destinationForPath('/notifications')?.key).toBe('admin');
    expect(destinationForPath('/profile')).toBeNull();
  });

  it('réserve les destinations d’administration aux admins', () => {
    const plain = destinationsFor(false, false).map((d) => d.key);
    expect(plain).toContain('discover');
    expect(plain).toContain('calendar');
    expect(plain).not.toContain('dashboard');
    expect(plain).not.toContain('settings');
  });

  it('n’affiche « Problèmes signalés » qu’aux modérateurs non-admins', () => {
    expect(destinationsFor(false, true).map((d) => d.key)).toContain('issues');
    expect(destinationsFor(true, true).map((d) => d.key)).not.toContain('issues');
  });
});

describe('navigation — sections', () => {
  it('donne à Découvrir ses sections, sans le Calendrier devenu destination', () => {
    const sections = sectionsFor('discover', ctx());
    expect(keys(sections)).toEqual(['home', 'shows', 'movies', 'requests']);
  });

  it('réserve Améliorations VF aux admins dans la Bibliothèque', () => {
    expect(keys(sectionsFor('library', ctx()))).toContain('vf');
    expect(keys(sectionsFor('library', ctx({ isAdmin: false })))).not.toContain('vf');
  });

  it('construit les sections Téléchargements depuis les instances réelles', () => {
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

    expect(keys(sections)).toEqual(['overview', 'queue', 'radarr-1', 'sonarr-4', 'clients', 'client-7']);
    expect(sections.find((s) => s.key === 'radarr-1').to).toEqual({
      path: '/downloads',
      query: { view: 'radarr', instance: '1' },
    });
  });

  it('ignore les instances désactivées', () => {
    const sections = sectionsFor(
      'downloads',
      ctx({
        arrInstances: [{ id: 1, name: 'Radarr HD', arr_type: 'radarr', enabled: false }],
        downloadClients: [{ id: 7, name: 'DATA', enabled: false }],
      })
    );
    expect(keys(sections)).toEqual(['overview', 'queue', 'clients']);
  });

  it('retourne une liste vide pour une destination sans sections', () => {
    expect(sectionsFor('calendar', ctx())).toEqual([]);
    expect(sectionsFor('inconnue', ctx())).toEqual([]);
  });

  it('regroupe en conservant l’ordre de première apparition', () => {
    const groups = groupedSections(sectionsFor('settings', ctx()));
    expect(groups.map((g) => g.label)).toEqual(['', 'Services', 'Bibliothèque & acquisition', 'Exploitation', 'Système']);
  });
});

describe('navigation — section active', () => {
  it('dérive l’état actif de la Bibliothèque depuis ?type=', () => {
    const sections = sectionsFor('library', ctx());
    expect(activeSectionKey(sections, route('/library'))).toBe('home');
    expect(activeSectionKey(sections, route('/library', { type: 'show' }))).toBe('shows');
    expect(activeSectionKey(sections, route('/library', { type: 'album' }))).toBe('music');
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
    expect(activeSectionKey(sections, one)).toBe('client-2');
  });

  it('n’active rien quand aucune section ne correspond', () => {
    expect(activeSectionKey(sectionsFor('discover', ctx()), route('/discover/explore'))).toBe('');
  });
});
