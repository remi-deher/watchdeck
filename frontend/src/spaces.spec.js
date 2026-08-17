import { reactive } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';

import { SPACES, collapseStorageKey, libraryTypeFilters, spaceForPath } from './spaces';
import { useSpaceSidebar } from './composables/useSpaceSidebar';

function itemsOf(slug) {
  return SPACES.find(space => space.slug === slug).nav.flatMap(section => section.items);
}

describe('spaces — résolution de l’espace courant', () => {
  it.each([
    ['/discover', 'discover'],
    ['/discover/shows', 'discover'],
    ['/library', 'library'],
    ['/vf-upgrades', 'library'],
    ['/activity', 'activity'],
    ['/analytics', 'activity'],
    ['/downloads', 'downloads'],
    ['/users', 'admin'],
    ['/notifications', 'admin'],
    ['/settings', 'settings'],
    ['/logs', 'settings'],
    ['/maintenance', 'settings'],
  ])('%s → espace %s', (path, slug) => {
    expect(spaceForPath(path).slug).toBe(slug);
  });

  it('retourne null hors des espaces, pour la sidebar principale', () => {
    expect(spaceForPath('/dashboard')).toBeNull();
    expect(spaceForPath('/profile')).toBeNull();
    expect(spaceForPath('/calendar')).toBeNull();
  });

  it('conserve les clés localStorage historiques', () => {
    expect(collapseStorageKey('discover')).toBe('watchdeck.discoverSidebarCollapsed');
    expect(collapseStorageKey('library')).toBe('watchdeck.librarySidebarCollapsed');
    expect(collapseStorageKey(undefined)).toBe('watchdeck.sidebarCollapsed');
  });

  it('déclare soit une nav de données, soit un composant dédié', () => {
    for (const space of SPACES) {
      expect(Boolean(space.nav) !== Boolean(space.component)).toBe(true);
    }
  });
});

describe('spaces — entrées de navigation', () => {
  it('donne à chaque espace déclaratif au moins une entrée en barre mobile', () => {
    for (const space of SPACES.filter(entry => entry.nav)) {
      expect(itemsOf(space.slug).some(item => item.mobile)).toBe(true);
    }
  });

  it('utilise des clés uniques par espace', () => {
    for (const space of SPACES.filter(entry => entry.nav)) {
      const keys = itemsOf(space.slug).map(item => item.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('réserve Améliorations VF aux profils habilités', () => {
    const vf = itemsOf('library').find(item => item.key === 'vf');
    expect(vf.admin).toBe(true);
  });

  it('place Calendrier dans la feuille « Plus » de Découvrir, pas dans la barre', () => {
    const calendar = itemsOf('discover').find(item => item.key === 'calendar');
    expect(calendar.more).toBe(true);
    expect(calendar.mobile).toBeUndefined();
  });
});

describe('spaces — état actif de Bibliothèque, dérivé de ?type=', () => {
  const items = () => itemsOf('library');
  const activeKeys = query => items()
    .filter(item => item.active?.({ query }))
    .map(item => item.key);

  it('active Accueil quand aucun type n’est sélectionné', () => {
    expect(activeKeys({})).toEqual(['home']);
  });

  it('active Séries sur ?type=show', () => {
    expect(activeKeys({ type: 'show' })).toEqual(['shows']);
  });

  it('active Musiques sur n’importe quel type musical', () => {
    expect(activeKeys({ type: 'album' })).toEqual(['music']);
    expect(activeKeys({ type: ['artist', 'track'] })).toEqual(['music']);
  });

  it('cible le hub sans conserver les filtres de la grille précédente', () => {
    const shows = items().find(item => item.key === 'shows');
    expect(shows.to()).toEqual({ path: '/library', query: { hub: '1', type: ['show'] } });
  });

  it('normalise ?type= répétable en tableau', () => {
    expect(libraryTypeFilters({ query: {} })).toEqual([]);
    expect(libraryTypeFilters({ query: { type: 'movie' } })).toEqual(['movie']);
    expect(libraryTypeFilters({ query: { type: ['movie', 'show'] } })).toEqual(['movie', 'show']);
  });
});

describe('useSpaceSidebar', () => {
  beforeEach(() => localStorage.clear());

  it('bascule l’espace courant et le persiste sous sa clé', () => {
    const route = reactive({ path: '/discover' });
    const { activeSpace, collapsed, toggle } = useSpaceSidebar(route);

    expect(activeSpace.value.slug).toBe('discover');
    expect(collapsed.value).toBe(false);
    toggle();
    expect(collapsed.value).toBe(true);
    expect(localStorage.getItem('watchdeck.discoverSidebarCollapsed')).toBe('true');
  });

  it('garde un état distinct par espace', () => {
    const route = reactive({ path: '/discover' });
    const { collapsed, toggle } = useSpaceSidebar(route);
    toggle();
    expect(collapsed.value).toBe(true);

    route.path = '/library';
    expect(collapsed.value).toBe(false);
    expect(localStorage.getItem('watchdeck.librarySidebarCollapsed')).toBeNull();
  });

  it('relit la préférence déjà enregistrée', () => {
    localStorage.setItem('watchdeck.activitySidebarCollapsed', 'true');
    const { collapsed } = useSpaceSidebar(reactive({ path: '/analytics' }));
    expect(collapsed.value).toBe(true);
  });

  it('retombe sur la sidebar principale hors espace', () => {
    const { activeSpace, toggle } = useSpaceSidebar(reactive({ path: '/dashboard' }));
    expect(activeSpace.value).toBeNull();
    toggle();
    expect(localStorage.getItem('watchdeck.sidebarCollapsed')).toBe('true');
  });

  it('adapte la valeur par défaut lorsque la fenêtre passe en mode tablette', () => {
    const listeners = new Set();
    let matches = false;
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = () => ({
      get matches() { return matches; },
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    });

    try {
      const { collapsed } = useSpaceSidebar(reactive({ path: '/discover' }));
      expect(collapsed.value).toBe(false);

      matches = true;
      listeners.forEach(listener => listener({ matches }));
      expect(collapsed.value).toBe(true);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
