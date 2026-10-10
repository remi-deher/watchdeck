import { expect, test } from '@playwright/test';

function availability(plex, state = 'unknown') {
  return {
    plex, library_id: plex === 'present' ? 7 : null,
    episodes: { source: 'arr', state, available: state === 'partial' ? 3 : null, aired: state === 'partial' ? 8 : null, total: null },
    languages: { has_vf: false, vf_granularity: null, fr_is_default: null, sub_fr_status: null, forced_fr_status: null },
    quality: { source: 'unknown', resolution: null },
  };
}

test('le catalogue distingue Plex, import terminé et fichiers partiels ARR', async ({ page }) => {
  const items = [
    { id: 1, tmdb_id: 1, title: 'Présent', availability: availability('present') },
    { id: 2, tmdb_id: 2, title: 'Import terminé', available: true, requested: true, request_status: 'available', availability: availability('absent') },
    { id: 3, tmdb_id: 3, title: 'Série partielle', available: true, requested: true, request_status: 'partially_available', availability: availability('absent', 'partial') },
  ].map(item => ({ media_type: 'movie', year: 2026, poster_url: null, ...item }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { role: 'admin', is_owner: true } });
    if (path === '/api/discover/genres') return route.fulfill({ json: [] });
    if (path.startsWith('/api/discover/')) return route.fulfill({ json: { items, page: 1, total_pages: 1, total_results: 3 } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/discover/movies');
  await expect(page.locator('.discover-card')).toHaveCount(3);
  await expect(page.locator('.discover-card').nth(0).locator('.discover-status-badge')).toHaveText('Dans Plex');
  await expect(page.locator('.discover-card').nth(1).locator('.discover-status-badge')).toHaveText('À confirmer dans Plex');
  await expect(page.locator('.discover-card').nth(2).locator('.discover-status-badge')).toHaveText('Fichiers partiels · *ARR');
});
