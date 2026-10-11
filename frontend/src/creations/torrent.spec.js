import { afterEach, describe, expect, it, vi } from 'vitest';
import { torrentCreation } from './torrent';

const apiMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@/api', () => ({ api: apiMock }));

const metadata = { categories: ['Films', 'Séries'], tags: ['vff'], mutable: true };
const context = (extra = {}) => ({
  clients: [{ id: 7, name: 'Maison', client_type: 'qbittorrent' }, { id: 8, name: 'Seedbox' }],
  metadata: () => metadata,
  ensure: vi.fn(async () => {}),
  ...extra,
});
const values = (extra = {}) => ({ client_id: '7', source: 'url', url: ' magnet:?xt=urn:btih:abc ', file: null, category: 'films', tags: 'VFF, 4k, vff', ...extra });
afterEach(() => { vi.restoreAllMocks(); apiMock.mockClear(); });

describe('torrentCreation', () => {
  it('n’offre le choix du client que s’il y en a plusieurs, et propose ce que le client connaît', () => {
    const many = torrentCreation(context());
    const fields = many.steps[0].fields;
    expect(fields.find((field) => field.key === 'client_id').when()).toBe(true);
    expect(fields.find((field) => field.key === 'client_id').options[0]).toEqual({ value: '7', label: 'Maison (qbittorrent)' });
    expect(fields.find((field) => field.key === 'category').suggestions({ client_id: '7' })).toEqual(['Films', 'Séries']);
    const one = torrentCreation(context({ clients: [{ id: 7, name: 'Maison' }] }));
    expect(one.steps[0].fields.find((field) => field.key === 'client_id').when()).toBe(false);
  });

  it('montre le lien ou le fichier selon la source', () => {
    const fields = torrentCreation(context()).steps[0].fields;
    const url = fields.find((field) => field.key === 'url');
    const file = fields.find((field) => field.key === 'file');
    expect([url.when({ source: 'url' }), url.when({ source: 'file' })]).toEqual([true, false]);
    expect([file.when({ source: 'file' }), file.accept]).toEqual([true, '.torrent']);
  });

  it('envoie un lien avec la catégorie et les tags à la casse du client, sans doublon', async () => {
    const ctx = context();
    const result = await torrentCreation(ctx).submit(values());
    expect(ctx.ensure).toHaveBeenCalledWith('7', 'Films', 'vff, 4k');
    expect(apiMock).toHaveBeenCalledWith('/api/downloads/add', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(apiMock.mock.calls[0][1].body)).toEqual({ client_id: 7, torrent_url_or_magnet: 'magnet:?xt=urn:btih:abc', category: 'Films', tags: 'vff, 4k' });
    expect(result.message).toBe('Torrent ajouté');
  });

  it('envoie un fichier .torrent en formulaire, et remonte l’échec du serveur', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'film.torrent');
    await torrentCreation(context()).submit(values({ source: 'file', file, category: '', tags: '' }));
    const form = fetchMock.mock.calls[0][1].body;
    expect(fetchMock.mock.calls[0][0]).toBe('/api/downloads/add-file');
    expect(form.get('file').name).toBe('film.torrent');
    expect(form.get('client_id')).toBe('7');
    expect(form.has('category')).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ detail: 'Torrent invalide' }) })));
    await expect(torrentCreation(context()).submit(values({ source: 'file', file }))).rejects.toThrow('Torrent invalide');
    vi.unstubAllGlobals();
  });
});
