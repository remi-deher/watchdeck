import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectClientCapabilities } from './clientCapabilities';

describe('collectClientCapabilities', () => {
  afterEach(() => vi.restoreAllMocks());

  it('collecte des capacités sans exposer de modèle ni de user-agent', () => {
    document.documentElement.style.setProperty('--safe-top', '47px');
    document.documentElement.style.setProperty('--safe-bottom', '34px');
    vi.stubGlobal('matchMedia', (query) => ({ matches: query.includes('pointer: coarse') || query.includes('display-mode') }));
    const result = collectClientCapabilities();
    expect(result.safeArea.top).toBe(47);
    expect(result.safeArea.bottom).toBe(34);
    expect(result.pointer).toBe('coarse');
    expect(result.standalone).toBe(true);
    expect(result).not.toHaveProperty('model');
    expect(result).not.toHaveProperty('userAgent');
    vi.unstubAllGlobals();
  });
});
