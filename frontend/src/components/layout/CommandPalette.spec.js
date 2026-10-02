import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import CommandPalette from './CommandPalette.vue';

const push = vi.fn(() => Promise.resolve());
const resolve = (to) => {
  if (typeof to !== 'string') return { path: to.path, query: to.query || {}, hash: '' };
  const [path, qs = ''] = to.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)), hash: '' };
};

vi.mock('@/api', () => ({
  api: vi.fn(() => Promise.resolve({ items: Array.from({ length: 7 }, (_, i) => ({
    media_type: 'movie', tmdb_id: 100 + i, title: `Dune ${i}`, poster_url: `/api/image-proxy?url=p${i}`,
  })) })),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, resolve }),
  useRoute: () => ({ path: '/discover', query: {}, fullPath: '/discover' }),
}));

vi.mock('@/composables/useDownloadSources', () => ({
  useDownloadSources: () => ({
    arrInstances: { value: [{ id: 2, name: 'Sonarr principal', arr_type: 'sonarr' }] },
    downloadClients: { value: [{ id: 7, name: 'qBittorrent DATA' }] },
    load: vi.fn(() => Promise.resolve()),
  }),
}));

function factory(props = { isAdmin: true, canModerate: true }) {
  // Un client neuf par montage : le cache de la recherche catalogue ne doit pas fuir
  // d'un test a l'autre.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(CommandPalette, { props, attachTo: document.body, global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
}

function pressCtrlK() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
}

const optionTexts = (wrapper) => wrapper.findAll('[role="option"]').map((node) => node.text());

describe('CommandPalette', () => {
  beforeEach(() => push.mockClear());

  it('reste fermée tant que Ctrl+K n’a pas été pressé', () => {
    const wrapper = factory();
    expect(wrapper.find('.palette-input').exists()).toBe(false);
    wrapper.unmount();
  });

  it('n’affiche rien tant que rien n’est saisi', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it('trouve navigation, réglages et instances par leur nom', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();

    const all = [];
    for (const needle of ['explorer', 'parametres', 'sonarr', 'qbittorrent']) {
      await wrapper.get('.palette-input').setValue(needle);
      await flushPromises();
      all.push(...optionTexts(wrapper));
    }
    const texts = all.join(' | ');
    expect(texts).toContain('Explorer');
    expect(texts).toContain('Paramètres');
    expect(texts).toContain('Sonarr principal');
    expect(texts).toContain('qBittorrent DATA');
    wrapper.unmount();
  });

  it('filtre sans tenir compte des accents', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();

    await wrapper.get('.palette-input').setValue('parametres');

    const texts = optionTexts(wrapper).join(' | ');
    expect(texts).toContain('Paramètres');
    expect(texts).not.toContain('Explorer');
    wrapper.unmount();
  });

  it('navigue avec les flèches et ouvre la sélection avec Entrée', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();

    const input = wrapper.get('.palette-input');
    await input.setValue('sonarr');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({
      path: '/downloads',
      query: { view: 'sonarr', instance: '2' },
    });
    wrapper.unmount();
  });

  it('ne se ferme qu’une fois la navigation résolue', async () => {
    // useBackButtonClose consomme son entree d'historique par un history.back() a la
    // fermeture : si la palette fermait avant que la navigation soit commitee, ce
    // back() ramenerait l'utilisateur sur la page de depart. Le contrat verifiable
    // ici est donc que `activate` attend router.push avant d'appeler close().
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();

    let commitNavigation;
    push.mockImplementationOnce(() => new Promise((resolve) => { commitNavigation = resolve; }));

    const input = wrapper.get('.palette-input');
    await input.setValue('sonarr');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(wrapper.find('.palette-input').exists()).toBe(true);

    commitNavigation();
    await flushPromises();

    expect(wrapper.find('.palette-input').exists()).toBe(false);
    wrapper.unmount();
  });

  it('n’expose ni réglages ni instances à un utilisateur non-admin', async () => {
    const wrapper = factory({ isAdmin: false, canModerate: false });
    pressCtrlK();
    await flushPromises();

    await wrapper.get('.palette-input').setValue('explorer');
    await flushPromises();
    expect(optionTexts(wrapper).join(' | ')).toContain('Explorer');
    await wrapper.get('.palette-input').setValue('sonarr');
    await flushPromises();
    expect(optionTexts(wrapper).join(' | ')).not.toContain('Sonarr principal');
    await wrapper.get('.palette-input').setValue('version');
    await flushPromises();
    expect(optionTexts(wrapper).join(' | ')).not.toContain('Version & mises à jour');
    wrapper.unmount();
  });

  it('bascule à la fermeture si Ctrl+K est pressé une seconde fois', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();
    expect(wrapper.find('.palette-input').exists()).toBe(true);

    pressCtrlK();
    await flushPromises();
    expect(wrapper.find('.palette-input').exists()).toBe(false);
    wrapper.unmount();
  });

  it('montre cinq affiches puis ouvre la fiche en feuille', async () => {
    vi.useFakeTimers();
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();
    await wrapper.get('.palette-input').setValue('dune');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    vi.useRealTimers();

    const covers = wrapper.findAll('.palette-cover:not(.palette-cover-more)');
    expect(covers).toHaveLength(5);
    expect(covers[0].find('img').attributes('src')).toContain('image-proxy');

    // Entree vise le premier resultat : la premiere affiche.
    await wrapper.get('.palette-input').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    // L'adresse de depart voyage dans l'etat : c'est elle qui fait de la fiche une feuille.
    expect(push.mock.calls[0][0]).toMatchObject({
      path: '/discover/media/discover/100',
      state: { __overlayBackground: '/discover' },
    });
    wrapper.unmount();
  });

  it('« Voir tous les médias » ouvre Explorer sur la recherche', async () => {
    vi.useFakeTimers();
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();
    await wrapper.get('.palette-input').setValue('dune');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    vi.useRealTimers();

    const input = wrapper.get('.palette-input');
    for (let i = 0; i < 5; i += 1) await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(push.mock.calls[0][0]).toMatchObject({ path: '/discover', query: { q: 'dune' } });
    wrapper.unmount();
  });

  it('« Voir les résultats » déplie la liste de navigation', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();
    await wrapper.get('.palette-input').setValue('e');
    await flushPromises();

    expect(wrapper.findAll('.palette-option:not(.palette-more)')).toHaveLength(5);
    const input = wrapper.get('.palette-input');
    for (let i = 0; i < 5; i += 1) await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(wrapper.findAll('.palette-option').length).toBeGreaterThan(5);
    expect(wrapper.find('.palette-back').exists()).toBe(true);
    expect(push).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('parcourt les affiches avec ← →', async () => {
    vi.useFakeTimers();
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();
    await wrapper.get('.palette-input').setValue('dune');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    vi.useRealTimers();

    const input = wrapper.get('.palette-input');
    await input.trigger('keydown', { key: 'ArrowRight' });
    await input.trigger('keydown', { key: 'ArrowRight' });
    await input.trigger('keydown', { key: 'ArrowLeft' });
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(push.mock.calls[0][0]).toMatchObject({ path: '/discover/media/discover/101' });
    wrapper.unmount();
  });

  it('ne liste qu’une fois une destination présente dans la navigation et les réglages', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();
    await wrapper.get('.palette-input').setValue('plex');
    await flushPromises();
    const labels = wrapper.findAll('.palette-option .palette-label').map((n) => n.text());
    expect(labels.filter((l) => l === 'Plex & Bibliothèque')).toHaveLength(1);
    wrapper.unmount();
  });
});
