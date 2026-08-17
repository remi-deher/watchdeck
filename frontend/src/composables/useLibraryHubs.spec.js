import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));
vi.mock('@/utils/mediaImage', () => ({ proxyUrl: url => (url ? `proxy:${url}` : url) }));

const { useLibraryHubs } = await import('./useLibraryHubs');

const isAbort = error => error?.name === 'AbortError';

function factory(onError = vi.fn()) {
  return { hubs: useLibraryHubs({ isAbort, onError }), onError };
}

/** Réponses dans l'ordre où chaque chargeur les demande. */
function respondWith(...payloads) {
  payloads.forEach(payload => api.mockResolvedValueOnce(payload));
}

describe('useLibraryHubs', () => {
  beforeEach(() => api.mockReset().mockResolvedValue([]));

  it('marque les éléments de bibliothèque pour la grille', async () => {
    respondWith([{ id: 1 }], [{ id: 2 }], [{ id: 3 }], [{ id: 4 }]);
    const { hubs } = factory();
    await hubs.loadMusicHub();
    expect(hubs.music.recent.value).toEqual([{ id: 1, _kind: 'library' }]);
    expect(hubs.music.artists.value).toEqual([{ id: 2, _kind: 'library' }]);
    expect(hubs.music.albums.value).toEqual([{ id: 3, _kind: 'library' }]);
    expect(hubs.music.tracks.value).toEqual([{ id: 4, _kind: 'library' }]);
  });

  it('charge les quatre rangées Musique en parallèle', async () => {
    const { hubs } = factory();
    await hubs.loadMusicHub();
    const urls = api.mock.calls.map(call => call[0]);
    expect(urls).toHaveLength(4);
    expect(urls[0]).toContain('media_types=artist,album,track');
    expect(urls.some(u => u.includes('media_types=track'))).toBe(true);
  });

  it('passe les demandes par le proxy d’images', async () => {
    respondWith([], [], [], [], { items: [{ id: 9, poster_url: 'http://p' }] });
    const { hubs } = factory();
    await hubs.loadAllHub();
    expect(hubs.all.requests.value).toEqual([
      { id: 9, poster_url: 'proxy:http://p', _kind: 'request' },
    ]);
  });

  it('remplit une rangée par bibliothèque dans le hub « Tout »', async () => {
    respondWith([{ id: 1 }], [{ id: 2 }], [{ id: 3 }], [{ id: 4 }], { items: [] });
    const { hubs } = factory();
    await hubs.loadAllHub();
    expect(hubs.all.recent.value[0].id).toBe(1);
    expect(hubs.all.movies.value[0].id).toBe(2);
    expect(hubs.all.shows.value[0].id).toBe(3);
    expect(hubs.all.music.value[0].id).toBe(4);
  });

  it('charge les rangées par genre en seconde vague', async () => {
    respondWith(
      [{ id: 1 }],
      { items: [] },
      [{ genre: 'Action' }, { genre: 'Drame' }],
      [{ id: 10 }],
      [{ id: 20 }],
    );
    const { hubs } = factory();
    await hubs.loadTypeHub('movie');
    expect(hubs.type.genreRows.value).toEqual([
      { genre: 'Action', items: [{ id: 10, _kind: 'library' }] },
      { genre: 'Drame', items: [{ id: 20, _kind: 'library' }] },
    ]);
    expect(api.mock.calls[3][0]).toContain('genre=Action');
  });

  it('échappe le genre dans l’URL', async () => {
    respondWith([], { items: [] }, [{ genre: 'Science & Fiction' }], []);
    const { hubs } = factory();
    await hubs.loadTypeHub('show');
    expect(api.mock.calls[3][0]).toContain('genre=Science%20%26%20Fiction');
  });

  it('tolère l’absence de genres', async () => {
    respondWith([], { items: [] });
    api.mockRejectedValueOnce(new Error('genres indisponibles'));
    const { hubs, onError } = factory();
    await hubs.loadTypeHub('movie');
    expect(hubs.type.genreRows.value).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('lève le drapeau de chargement puis le rabaisse', async () => {
    const { hubs } = factory();
    expect(hubs.music.loading.value).toBe(false);
    const pending = hubs.loadMusicHub();
    expect(hubs.music.loading.value).toBe(true);
    await pending;
    expect(hubs.music.loading.value).toBe(false);
  });

  it('remonte une vraie erreur', async () => {
    // Une seule requête tombe : Promise.all rejette, les autres restent traitées.
    api.mockReset().mockResolvedValue([]);
    api.mockRejectedValueOnce(new Error('panne'));
    const { hubs, onError } = factory();
    await hubs.loadAllHub();
    expect(onError).toHaveBeenCalledWith('panne');
    expect(hubs.all.loading.value).toBe(false);
  });

  it('ignore une requête annulée par un changement de filtre', async () => {
    const aborted = new Error('annulee');
    aborted.name = 'AbortError';
    api.mockReset().mockResolvedValue([]);
    api.mockRejectedValueOnce(aborted);
    const { hubs, onError } = factory();
    await hubs.loadMusicHub();
    expect(onError).not.toHaveBeenCalled();
    expect(hubs.music.loading.value).toBe(false);
  });

  it('transmet le signal d’annulation à chaque requête', async () => {
    const options = { signal: 'sentinelle' };
    const { hubs } = factory();
    await hubs.loadAllHub(options);
    expect(api.mock.calls.every(call => call[1] === options)).toBe(true);
  });
});
