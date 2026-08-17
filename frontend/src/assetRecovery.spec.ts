import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStaleAssetError, purgeStaleAssetState } from './assetRecovery';

describe('asset recovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reconnait les erreurs de chunks Safari, Vite et Webpack', () => {
    expect(isStaleAssetError(new TypeError('Load failed for a dynamically imported module'))).toBe(true);
    expect(isStaleAssetError(new Error('Unable to preload CSS for chunk'))).toBe(true);
    expect(isStaleAssetError(new Error('ChunkLoadError'))).toBe(true);
    expect(isStaleAssetError(new Error('Erreur API'))).toBe(false);
  });

  it('purge les caches Watchdeck et desactive les anciens service workers', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['watchdeck-cache-v1', 'third-party']), delete: deleteCache });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });

    await purgeStaleAssetState();

    expect(deleteCache).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith('watchdeck-cache-v1');
    expect(unregister).toHaveBeenCalledOnce();
  });
});
