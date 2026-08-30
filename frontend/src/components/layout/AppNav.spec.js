import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppNav from './AppNav.vue';

let currentRoute = { path: '/discover', query: {}, fullPath: '/discover' };

vi.mock('vue-router', () => ({
  useRoute: () => currentRoute,
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: {
    props: ['to'],
    template: '<a :href="linkHref(to)"><slot /></a>',
    methods: {
      linkHref: (to) => (typeof to === 'string' ? to : to.path),
    },
  },
}));

const loadSources = vi.fn(() => Promise.resolve());
vi.mock('@/composables/useDownloadSources', () => ({
  useDownloadSources: () => ({
    arrInstances: { value: [{ id: 1, name: 'Radarr HD', arr_type: 'radarr' }] },
    downloadClients: { value: [{ id: 7, name: 'DATA' }] },
    load: loadSources,
  }),
}));

function factory(props = {}) {
  return mount(AppNav, {
    props: { orientation: 'bar', isAdmin: true, canModerate: true, ...props },
    attachTo: document.body,
  });
}

const tabs = (wrapper) => wrapper.findAll('.app-nav-items .app-nav-link').map((n) => n.text().trim());
const menuLinks = () => [...document.querySelectorAll('.app-nav-menu-link')].map((n) => n.textContent.trim());
const menuGroups = () => [...document.querySelectorAll('.app-nav-menu-group')].map((n) => n.textContent.trim());

async function openMenu(wrapper) {
  await wrapper.get('.app-nav-burger').trigger('click');
  await flushPromises();
}

describe('AppNav', () => {
  beforeEach(() => {
    currentRoute = { path: '/discover', query: {}, fullPath: '/discover' };
    loadSources.mockClear();
    document.body.innerHTML = '';
  });

  it('met les sections de l’espace courant dans la barre, pas les espaces', () => {
    const wrapper = factory();
    // Quatre emplacements : la cinquième section part dans le ☰.
    expect(tabs(wrapper)).toEqual(['Accueil', 'Séries', 'Films', 'Demandes']);
    expect(tabs(wrapper)).not.toContain('Téléchargements');
    wrapper.unmount();
  });

  it('montre toutes les sections dans le rail, qui a la hauteur', () => {
    const wrapper = factory({ orientation: 'rail' });
    expect(tabs(wrapper)).toEqual(['Accueil', 'Séries', 'Films', 'Demandes', 'Calendrier']);
    wrapper.unmount();
  });

  it('marque la section courante avec aria-current', () => {
    currentRoute = { path: '/discover/shows', query: {}, fullPath: '/discover/shows' };
    const wrapper = factory();
    const active = wrapper.findAll('.app-nav-items .app-nav-link').filter((n) => n.classes('active'));
    expect(active).toHaveLength(1);
    expect(active[0].text()).toContain('Séries');
    expect(active[0].attributes('aria-current')).toBe('page');
    wrapper.unmount();
  });

  it('rend joignables depuis le ☰ les sections que la barre ne peut pas afficher', async () => {
    const wrapper = factory();
    await openMenu(wrapper);
    // Calendrier est la 5e section : absente de la barre, présente dans le menu.
    expect(menuLinks()).toContain('Calendrier');
    expect(menuGroups()).toContain('Découvrir');
    wrapper.unmount();
  });

  it('n’ajoute pas de groupe de sections quand la barre les affiche toutes', async () => {
    currentRoute = { path: '/activity', query: {}, fullPath: '/activity' };
    const wrapper = factory();
    await openMenu(wrapper);
    expect(menuGroups()).not.toContain('Activité & Insights');
    wrapper.unmount();
  });

  it('groupe les espaces sous Explorer et Gestion dans le ☰', async () => {
    const wrapper = factory();
    await openMenu(wrapper);
    expect(menuGroups()).toEqual(expect.arrayContaining(['Explorer', 'Gestion', 'Compte']));
    expect(menuLinks()).toEqual(expect.arrayContaining(['Bibliothèque', 'Téléchargements', 'Paramètres']));
    wrapper.unmount();
  });

  it('construit les sections Téléchargements à partir des instances réelles', async () => {
    currentRoute = { path: '/downloads', query: { view: 'overview' }, fullPath: '/downloads?view=overview' };
    const wrapper = factory({ orientation: 'rail' });
    await flushPromises();

    expect(tabs(wrapper)).toEqual(['Vue d’ensemble', 'File d’attente', 'Radarr HD', 'Tous les torrents', 'DATA']);
    expect(loadSources).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('ne charge les instances que dans la destination Téléchargements', () => {
    const wrapper = factory();
    expect(loadSources).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('dérive la section active de la Bibliothèque depuis ?type=', () => {
    currentRoute = { path: '/library', query: { type: 'show' }, fullPath: '/library?type=show' };
    const wrapper = factory({ orientation: 'rail' });
    const active = wrapper.findAll('.app-nav-items .app-nav-link').filter((n) => n.classes('active'));
    expect(active).toHaveLength(1);
    expect(active[0].text()).toContain('Séries');
    wrapper.unmount();
  });

  it('n’expose à un utilisateur simple que Découvrir, sans rien lui cacher', async () => {
    const wrapper = factory({ isAdmin: false, canModerate: false });
    expect(tabs(wrapper)).toEqual(['Accueil', 'Séries', 'Films', 'Demandes']);

    await openMenu(wrapper);
    expect(menuLinks()).not.toContain('Paramètres');
    expect(menuLinks()).toContain('Calendrier');
    wrapper.unmount();
  });

  it('émet open-palette depuis le ☰ et se referme', async () => {
    const wrapper = factory();
    await openMenu(wrapper);

    const search = [...document.querySelectorAll('.app-nav-menu-link')].find((n) => n.textContent.includes('Rechercher'));
    search.click();
    await flushPromises();

    expect(wrapper.emitted('open-palette')).toHaveLength(1);
    expect(document.querySelector('.app-nav-menu')).toBeNull();
    wrapper.unmount();
  });
});
