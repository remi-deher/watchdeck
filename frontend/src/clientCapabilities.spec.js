import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectClientCapabilities, reportClientCapabilities } from './clientCapabilities';
import { api } from './api';

vi.mock('./api', () => ({ api: vi.fn(() => Promise.resolve({})) }));

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

describe('reportClientCapabilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("n'envoie rien tant que l'onglet masque mesure un viewport de 0", async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('innerWidth', 0);
    vi.stubGlobal('innerHeight', 0);
    vi.stubGlobal('visualViewport', { width: 0, height: 0 });
    api.mockClear();

    await reportClientCapabilities();

    expect(api).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('watchdeck:client-capabilities:v1')).toBeNull();
  });

  it('envoie le releve des que le viewport est mesurable', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 720);
    vi.stubGlobal('visualViewport', { width: 1280, height: 720 });
    api.mockClear();

    await reportClientCapabilities();

    expect(api).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(api.mock.calls[0][1].body);
    expect(payload.viewport.width).toBe(1280);
    expect(sessionStorage.getItem('watchdeck:client-capabilities:v1')).toBe('1');
  });
});
