import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/api';

import { useVfUpgrade } from './useVfUpgrade';

vi.mock('@/api', () => ({ api: vi.fn() }));

const suggestion = {
  id: 4, scope: 'movie', season_number: null, episode_number: null,
  status: 'pending', releases: [{ guid: 'release', indexer_id: 2 }],
};

describe('useVfUpgrade', () => {
  beforeEach(() => api.mockReset());

  it('preserves arr acceptance feedback after refreshing the suggestion', async () => {
    const upgrade = useVfUpgrade('library_item', 8, 'movie');
    api.mockResolvedValueOnce({ suggestions: [suggestion] });
    await upgrade.load();
    api.mockResolvedValueOnce({ message: 'Release acceptée par Radarr.' });
    api.mockResolvedValueOnce({ suggestions: [{ ...suggestion, status: 'accepted' }] });

    await upgrade.grab(suggestion.releases[0]);

    expect(upgrade.feedback.value).toBe('Release acceptée par Radarr.');
  });

  it('does not force the grab by default, so server guardrails stay armed', async () => {
    /* `force` désarme les garde-fous du serveur (release refusée par le profil *arr,
       régression technique). Il était envoyé à true sur TOUS les grabs de l'interface
       VF, ce qui les neutralisait entièrement. */
    const upgrade = useVfUpgrade('library_item', 8, 'movie');
    api.mockResolvedValueOnce({ suggestions: [suggestion] });
    await upgrade.load();
    api.mockResolvedValueOnce({ message: 'ok' });
    api.mockResolvedValueOnce({ suggestions: [suggestion] });

    await upgrade.grab(suggestion.releases[0]);

    const body = JSON.parse(api.mock.calls.find(([url]) => url.includes('/grab'))[1].body);
    expect(body.force).toBe(false);
  });

  it('forces the grab only when the caller asks, after an explicit confirmation', async () => {
    const upgrade = useVfUpgrade('library_item', 8, 'movie');
    api.mockResolvedValueOnce({ suggestions: [suggestion] });
    await upgrade.load();
    api.mockResolvedValueOnce({ message: 'ok' });
    api.mockResolvedValueOnce({ suggestions: [suggestion] });

    await upgrade.grab(suggestion.releases[0], { force: true });

    const body = JSON.parse(api.mock.calls.find(([url]) => url.includes('/grab'))[1].body);
    expect(body.force).toBe(true);
  });

  it('distinguishes no indexer result from releases filtered by VF policy', async () => {
    const upgrade = useVfUpgrade('library_item', 8, 'movie');
    api.mockResolvedValueOnce({ found: 0, raw_found: 7 });
    api.mockResolvedValueOnce({ suggestions: [] });

    await upgrade.scan();

    expect(upgrade.feedback.value).toContain('toutes ont été écartées');
    expect(upgrade.scanSummary.value).toEqual({ matched: 0, raw: 7 });
  });
});
