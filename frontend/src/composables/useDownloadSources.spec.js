import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api', () => ({ api }));

describe('useDownloadSources', () => {
  beforeEach(() => {
    vi.resetModules();
    api.mockReset();
  });

  it('partage un chargement simultané entre plusieurs consommateurs', async () => {
    api.mockImplementation(path => Promise.resolve(path === '/api/arr-instances' ? [{ id: 1 }] : [{ id: 2 }]));
    const { useDownloadSources } = await import('./useDownloadSources');
    const first = useDownloadSources();
    const second = useDownloadSources();
    await Promise.all([first.load(), second.load()]);
    expect(api).toHaveBeenCalledTimes(2);
    expect(first.arrInstances.value).toEqual([{ id: 1 }]);
    expect(second.downloadClients.value).toEqual([{ id: 2 }]);
  });

  it('conserve les données valides et expose une erreur partielle', async () => {
    api.mockImplementation(path => path === '/api/arr-instances' ? Promise.resolve([{ id: 1 }]) : Promise.reject(new Error('hors ligne')));
    const { useDownloadSources } = await import('./useDownloadSources');
    const sources = useDownloadSources();
    await sources.load({ force: true });
    expect(sources.arrInstances.value).toEqual([{ id: 1 }]);
    expect(sources.error.value).toContain('hors ligne');
  });
});
