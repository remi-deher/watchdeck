import { flushPromises, mount } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { defineComponent, h, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));
vi.mock('@/utils/mediaImage', () => ({ proxyUrl: url => (url ? `proxy:${url}` : url) }));

const { useLibraryHubs } = await import('./useLibraryHubs');

/** Monte le composable dans un composant muni d'un cache neuf ; `hub` pilote le hub actif. */
function factory({ hub = null, mediaType = 'movie', onError = vi.fn() } = {}) {
  const activeHub = ref(hub);
  const hubMediaType = ref(mediaType);
  let hubs;
  const Host = defineComponent({
    setup() {
      hubs = useLibraryHubs({ activeHub, hubMediaType, onError });
      return () => h('div');
    },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  return { hubs, onError, activeHub, hubMediaType };
}

/** Réponses dans l'ordre où chaque hub les demande. */
function respondWith(...payloads) {
  payloads.forEach(payload => api.mockResolvedValueOnce(payload));
}

describe('useLibraryHubs', () => {
  // Corps explicite : une fonction RENVOYEE par beforeEach est prise pour un nettoyage.
  beforeEach(() => { api.mockReset().mockResolvedValue([]); });

  it('ne lit aucun hub tant qu’aucun n’est affiché', async () => {
    factory();
    await flushPromises();
    expect(api).not.toHaveBeenCalled();
  });

  it('marque les éléments de bibliothèque pour la grille', async () => {
    respondWith([{ id: 1 }], [{ id: 2 }], [{ id: 3 }], [{ id: 4 }]);
    const { hubs } = factory({ hub: 'music' });
    await flushPromises();
    expect(hubs.music.recent.value).toEqual([{ id: 1, _kind: 'library' }]);
    expect(hubs.music.artists.value).toEqual([{ id: 2, _kind: 'library' }]);
    expect(hubs.music.albums.value).toEqual([{ id: 3, _kind: 'library' }]);
    expect(hubs.music.tracks.value).toEqual([{ id: 4, _kind: 'library' }]);
  });

  it('charge les quatre rangées Musique en parallèle', async () => {
    factory({ hub: 'music' });
    await flushPromises();
    const urls = api.mock.calls.map(call => call[0]);
    expect(urls).toHaveLength(4);
    expect(urls[0]).toContain('media_types=artist,album,track');
    expect(urls.some(u => u.includes('media_types=track'))).toBe(true);
  });

  it('passe les demandes par le proxy d’images', async () => {
    respondWith([], [], [], [], { items: [{ id: 9, poster_url: 'http://p' }] });
    const { hubs } = factory({ hub: 'all' });
    await flushPromises();
    expect(hubs.all.requests.value).toEqual([
      { id: 9, poster_url: 'proxy:http://p', _kind: 'request' },
    ]);
  });

  it('remplit une rangée par bibliothèque dans le hub « Tout »', async () => {
    respondWith([{ id: 1 }], [{ id: 2 }], [{ id: 3 }], [{ id: 4 }], { items: [] });
    const { hubs } = factory({ hub: 'all' });
    await flushPromises();
    expect(hubs.all.recent.value[0].id).toBe(1);
    expect(hubs.all.movies.value[0].id).toBe(2);
    expect(hubs.all.shows.value[0].id).toBe(3);
    expect(hubs.all.music.value[0].id).toBe(4);
  });

  it('charge les rangées par genre en seconde vague', async () => {
    respondWith([{ id: 1 }], { items: [] }, [{ genre: 'Action' }, { genre: 'Drame' }], [{ id: 10 }], [{ id: 20 }]);
    const { hubs } = factory({ hub: 'type', mediaType: 'movie' });
    await flushPromises();
    expect(hubs.type.genreRows.value).toEqual([
      { genre: 'Action', items: [{ id: 10, _kind: 'library' }] },
      { genre: 'Drame', items: [{ id: 20, _kind: 'library' }] },
    ]);
    expect(api.mock.calls[3][0]).toContain('genre=Action');
  });

  it('échappe le genre dans l’URL', async () => {
    respondWith([], { items: [] }, [{ genre: 'Science & Fiction' }], []);
    factory({ hub: 'type', mediaType: 'show' });
    await flushPromises();
    expect(api.mock.calls[3][0]).toContain('genre=Science%20%26%20Fiction');
  });

  it('tolère l’absence de genres', async () => {
    respondWith([], { items: [] });
    api.mockRejectedValueOnce(new Error('genres indisponibles'));
    const { hubs, onError } = factory({ hub: 'type' });
    await flushPromises();
    expect(hubs.type.genreRows.value).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('lève le drapeau de chargement puis le rabaisse', async () => {
    // Les quatre rangees partent en parallele : on les retient toutes pour les liberer.
    const pending = [];
    api.mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
    const { hubs, activeHub } = factory();
    expect(hubs.music.loading.value).toBe(false);
    activeHub.value = 'music';
    await flushPromises();
    expect(hubs.music.loading.value).toBe(true);
    pending.forEach(resolve => resolve([]));
    await flushPromises();
    await vi.waitFor(() => expect(hubs.music.loading.value).toBe(false));
  });

  it('remonte une vraie erreur', async () => {
    api.mockReset().mockResolvedValue([]);
    api.mockRejectedValueOnce(new Error('panne'));
    const { hubs, onError } = factory({ hub: 'all' });
    await flushPromises();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('panne'));
    expect(hubs.all.loading.value).toBe(false);
  });

  it('ignore une requête annulée par un changement de filtre', async () => {
    const aborted = new Error('annulee');
    aborted.name = 'AbortError';
    api.mockReset().mockResolvedValue([]);
    api.mockRejectedValueOnce(aborted);
    const { hubs, onError } = factory({ hub: 'music' });
    await flushPromises();
    expect(onError).not.toHaveBeenCalled();
    expect(hubs.music.loading.value).toBe(false);
  });

  it('transmet le signal d’annulation à chaque requête', async () => {
    factory({ hub: 'all' });
    await flushPromises();
    expect(api.mock.calls.length).toBe(5);
    expect(api.mock.calls.every(call => call[1]?.signal instanceof AbortSignal)).toBe(true);
  });

  it('repeint un hub déjà vu sans le relire, et le relit sur demande', async () => {
    const { hubs, activeHub } = factory({ hub: 'music' });
    await flushPromises();
    const firstRound = api.mock.calls.length;
    activeHub.value = 'all';
    await flushPromises();
    activeHub.value = 'music';
    await flushPromises();
    expect(api.mock.calls.filter(call => call[0].includes('media_types=artist&')).length).toBe(1);
    await hubs.refreshActiveHub();
    expect(api.mock.calls.filter(call => call[0].includes('media_types=artist&')).length).toBe(2);
    expect(firstRound).toBe(4);
  });
});
