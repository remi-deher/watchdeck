import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import SearchResultsSheet from './SearchResultsSheet.vue';
import { useSearchResults } from '@/composables/useSearchResults';
import { api } from '@/api';
import MediaPosterCard from '@/components/media/MediaPosterCard.vue';

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
  return mount(SearchResultsSheet, { props, attachTo: document.body, global: { plugins: [[VueQueryPlugin, { queryClient }]], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } } });
}

const state = useSearchResults();
async function search(needle) {
  state.query.value = needle;
  state.open.value = true;
  await flushPromises();
}
const optionTexts = (wrapper) => wrapper.findAll('[role="option"]').map((node) => node.text());

describe('résultats complémentaires dans la sheet', () => {
  beforeEach(() => {
    push.mockClear();
    api.mockClear();
    state.open.value = false;
    state.query.value = '';
  });

  it('reste fermée et ne lance aucune recherche avant ouverture', async () => {
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.find('.filter-sheet').exists()).toBe(false);
    expect(api).not.toHaveBeenCalled();
  });

  it('réutilise la sheet non modale sans ajouter de champ de recherche', async () => {
    const wrapper = factory();
    await search('sonarr');
    expect(wrapper.find('.filter-sheet').exists()).toBe(true);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('.drawer-backdrop').exists()).toBe(false);
  });

  it('trouve navigation, réglages et instances et ignore les accents', async () => {
    const wrapper = factory();
    const texts = [];
    for (const needle of ['explorer', 'parametres', 'sonarr', 'qbittorrent']) {
      await search(needle);
      texts.push(...optionTexts(wrapper));
    }
    expect(texts.join(' | ')).toContain('Explorer');
    expect(texts.join(' | ')).toContain('Connexions');
    expect(texts.join(' | ')).toContain('Sonarr principal');
    expect(texts.join(' | ')).toContain('qBittorrent DATA');
  });

  it('attend la navigation avant de fermer la sheet', async () => {
    const wrapper = factory();
    await search('sonarr');
    let commit;
    push.mockImplementationOnce(() => new Promise(resolve => { commit = resolve; }));
    await wrapper.get('.palette-option').trigger('click');
    await flushPromises();
    expect(state.open.value).toBe(true);
    expect(push.mock.calls[0][0]).toMatchObject({ path: '/downloads', query: { view: 'sonarr', instance: '2' } });
    commit();
    await flushPromises();
    expect(state.open.value).toBe(false);
  });

  it('ne propose pas les réglages ni les instances aux non-admins', async () => {
    const wrapper = factory({ isAdmin: false, canModerate: false });
    await search('sonarr');
    expect(optionTexts(wrapper).join(' | ')).not.toContain('Sonarr principal');
    await search('version');
    expect(optionTexts(wrapper).join(' | ')).not.toContain('Version & mises à jour');
    await search('explorer');
    expect(optionTexts(wrapper).join(' | ')).toContain('Explorer');
  });

  it('cherche les deux catalogues et passe les médias entiers aux cartes communes', async () => {
    const wrapper = factory();
    await search('dune');
    await new Promise(resolve => setTimeout(resolve, 300));
    await flushPromises();
    expect(api.mock.calls.some(([url]) => url.includes('/api/library?query=dune'))).toBe(true);
    expect(api.mock.calls.some(([url]) => url.includes('/api/discover/search?query=dune'))).toBe(true);
    const cards = wrapper.findAllComponents(MediaPosterCard);
    expect(cards).toHaveLength(12);
    expect(cards[0].props('media').poster_url).toContain('image-proxy');
    cards[6].vm.$emit('open', cards[6].props('media'));
    await flushPromises();
    expect(push.mock.calls[0][0]).toMatchObject({ path: '/discover/media/discover/100', state: { __overlayBackground: '/discover' } });
  });

  it('les titres des rails portent la saisie vers les listes complètes', async () => {
    const wrapper = factory();
    await search('dune');
    const rails = wrapper.findAllComponents({ name: 'MediaPosterCollection' });
    expect(rails[0].props('moreTo')).toEqual({ path: '/library', query: { query: 'dune' } });
    expect(rails[1].props('moreTo')).toEqual({ path: '/discover/explore', query: { q: 'dune' } });
  });

  it('déplie la navigation sans changer de page et la déduplique', async () => {
    const wrapper = factory();
    await search('e');
    expect(wrapper.findAll('.palette-option:not(.palette-more)')).toHaveLength(5);
    await wrapper.get('.palette-more').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.palette-option').length).toBeGreaterThan(5);
    expect(push).not.toHaveBeenCalled();
    await search('plex');
    expect(wrapper.findAll('.palette-label').filter(node => node.text() === 'Plex')).toHaveLength(1);
  });
});
