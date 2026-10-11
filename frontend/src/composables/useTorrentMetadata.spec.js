import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalName, normalizeTags, useTorrentMetadata } from './useTorrentMetadata';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('@/api', () => ({ api: apiMock }));
const payload = { categories: [{ name: 'Films' }], tags: ['vff'], mutable: true };
beforeEach(() => { apiMock.mockReset(); apiMock.mockResolvedValue(payload); });

describe('useTorrentMetadata', () => {
  it('reprend la casse de ce que le client connaît, sinon la saisie nettoyée', () => {
    expect(canonicalName(' films ', ['Films'])).toBe('Films');
    expect(canonicalName(' Nouveau ', ['Films'])).toBe('Nouveau');
    expect(normalizeTags('VFF, 4k, vff,, ', ['vff'])).toBe('vff, 4k');
  });

  it('lit chaque client, et un client en échec reste sans proposition', async () => {
    apiMock.mockImplementation(async (path) => { if (path.includes('/8/')) throw new Error('hors ligne'); return payload; });
    const metadata = useTorrentMetadata();
    await metadata.loadAll([7, 8]);
    expect(metadata.of(7)).toEqual({ categories: ['Films'], tags: ['vff'], mutable: true });
    expect(metadata.of(8)).toEqual({ categories: [], tags: [], mutable: false });
  });

  it('ne crée que ce que le client ne connaît pas encore', async () => {
    const metadata = useTorrentMetadata();
    await metadata.load(7);
    apiMock.mockClear();
    await metadata.ensure(7, 'films', 'vff, hdr');
    const bodies = apiMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(init.body));
    expect(bodies).toEqual([{ kind: 'tag', action: 'create', name: 'hdr' }]);
  });

  it('ne crée rien chez un client qui n’en est pas capable', async () => {
    apiMock.mockResolvedValue({ ...payload, mutable: false });
    const metadata = useTorrentMetadata();
    await metadata.load(7);
    apiMock.mockClear();
    await metadata.ensure(7, 'Nouveau', 'x');
    expect(apiMock).not.toHaveBeenCalled();
  });
});
