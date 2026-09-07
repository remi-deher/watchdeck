import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppNav from './AppNav.vue';

// Muté, jamais remplacé : le composant capture la référence au setup, et son watcher de
// route ne verrait rien d'une simple réaffectation.
const currentRoute = reactive({ path: '/discover', query: {}, fullPath: '/discover' });
const goTo = (path, query = {}) => Object.assign(currentRoute, { path, query, fullPath: path });

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

const destinations = (wrapper) => wrapper.findAll('.app-primary-items .app-primary-link').map((n) => n.text().trim());
const menuLinks = () => [...document.querySelectorAll('.app-nav-menu-link')].map((n) => n.textContent.trim());
const menuCategories = () => [...document.querySelectorAll('.app-nav-menu-category summary')].map((n) => n.textContent.trim());

async function openMenu(wrapper) {
  await wrapper.get('.app-nav-burger').trigger('click');
  await flushPromises();
}

describe('AppNav', () => {
  beforeEach(() => {
    goTo('/discover');
    loadSources.mockClear();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('met le workflow Découvrir dans la barre mobile', () => {
    const wrapper = factory();
    expect(destinations(wrapper)).toEqual(['Films', 'Séries', 'Demandes', 'Calendrier']);
    expect(wrapper.find('.app-context-header').exists()).toBe(false);
    wrapper.unmount();
  });

  it('conserve le workflow Découvrir dans la barre haute', () => {
    const wrapper = factory({ orientation: 'top' });
    expect(destinations(wrapper)).toEqual(['Films', 'Séries', 'Demandes', 'Calendrier']);
    expect(wrapper.find('.app-global-search').exists()).toBe(false);
    wrapper.unmount();
  });

  it('marque la section courante avec aria-current', async () => {
    goTo('/discover/shows');
    const wrapper = factory({ orientation: 'top' });
    const active = wrapper.findAll('.app-primary-items .app-primary-link').filter((n) => n.classes('active'));
    expect(active).toHaveLength(1);
    expect(active[0].text()).toContain('Séries');
    expect(active[0].attributes('aria-current')).toBe('page');
    wrapper.unmount();
  });

  it('ne conserve aucune seconde barre contextuelle', () => {
    const wrapper = factory({ orientation: 'top' });
    expect(wrapper.find('.app-context-header').exists()).toBe(false);
    expect(wrapper.find('.app-section-selector').exists()).toBe(false);
    wrapper.unmount();
  });

  it('affiche Films, Séries et VF dans le contexte Bibliothèque', () => {
    goTo('/library', { hub: '1' });
    const wrapper = factory();
    expect(destinations(wrapper)).toEqual(['Films', 'Séries', 'VF']);
    wrapper.unmount();
  });

  it('ne duplique pas les sections métier dans le menu Plus', async () => {
    goTo('/activity');
    const wrapper = factory();
    await openMenu(wrapper);
    expect(menuLinks()).not.toContain('Activité Plex');
    wrapper.unmount();
  });

  it('groupe les espaces dans des catégories dépliables dans le ☰', async () => {
    const wrapper = factory();
    await openMenu(wrapper);
    expect(menuCategories()).toEqual(expect.arrayContaining(['Pilotage', 'Explorer', 'Workflow', 'Administration', 'Compte et outils']));
    expect(menuLinks()).toEqual(expect.arrayContaining(['Bibliothèque', 'Acquisition', 'Administration']));
    expect(menuLinks()).toEqual(expect.arrayContaining(['Accueil', 'Profil', 'Déconnexion']));
    wrapper.unmount();
  });

  it('conserve des sections Acquisition stables indépendamment des instances', async () => {
    goTo('/downloads', { view: 'overview' });
    const wrapper = factory({ orientation: 'top' });
    await flushPromises();
    const pipeline = wrapper.findAll('.app-primary-item').find((item) => item.text().includes('Acquisition'));
    await pipeline.trigger('mouseenter');
    expect(pipeline.findAll('.app-primary-subnav a').map((item) => item.text().trim()))
      .toEqual(['Vue d’ensemble', 'File d’attente', 'Films', 'Séries', 'Clients']);
    expect(loadSources).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('ne charge les instances que dans la destination Téléchargements', () => {
    const wrapper = factory();
    expect(loadSources).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('laisse Catalogue actif quand le type de média change', async () => {
    goTo('/library', { type: 'show' });
    const wrapper = factory({ orientation: 'top' });
    const active = wrapper.findAll('.app-primary-items .app-primary-link').filter((n) => n.classes('active'));
    expect(active).toHaveLength(1);
    expect(active[0].text()).toContain('Séries');
    wrapper.unmount();
  });

  it('expose le workflow Découvrir à un utilisateur simple sans rien lui cacher', async () => {
    const wrapper = factory({ isAdmin: false, canModerate: false });
    expect(destinations(wrapper)).toEqual(['Films', 'Séries', 'Demandes', 'Calendrier']);
    expect(wrapper.find('.app-context-header').exists()).toBe(false);

    await openMenu(wrapper);
    expect(menuLinks()).not.toContain('Paramètres');
    expect(menuLinks()).toContain('Demandes');
    wrapper.unmount();
  });

  it('ferme le ☰ avant d’ouvrir la palette, pour ne pas la refermer aussitôt', async () => {
    const wrapper = factory();
    await openMenu(wrapper);

    const search = [...document.querySelectorAll('.app-nav-menu-link')].find((n) => n.textContent.includes('Recherche globale'));
    search.click();
    await flushPromises();

    // Le menu part le premier ; la palette n'est demandée qu'ensuite, sinon le
    // history.back() de la fermeture consommerait l'entrée que la palette vient de
    // pousser et la refermerait dans la foulée.
    expect(document.querySelector('.app-nav-menu')).toBeNull();
    expect(wrapper.emitted('open-palette')).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(wrapper.emitted('open-palette')).toHaveLength(1);
    wrapper.unmount();
  });

  it('laisse le watcher de route fermer le menu, sans annuler la navigation', async () => {
    const wrapper = factory();
    await openMenu(wrapper);

    const target = [...document.querySelectorAll('.app-nav-menu-link')].find((n) => n.textContent.trim() === 'Acquisition');
    target.click();
    await flushPromises();

    // Toujours ouvert : fermer ici déclencherait un history.back() qui annulerait le
    // router.push encore en vol. C'est le changement de route qui referme.
    expect(document.querySelector('.app-nav-menu')).not.toBeNull();

    goTo('/downloads');
    await flushPromises();
    expect(document.querySelector('.app-nav-menu')).toBeNull();
    wrapper.unmount();
  });
});
