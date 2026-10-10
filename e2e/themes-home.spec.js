import { expect, test } from '@playwright/test';

test('les palettes restaurées gardent un accueil lisible et sans débordement', async ({ page }, testInfo) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/stream')) return route.abort();
    const json = path === '/api/session' ? { role: 'admin', is_owner: true }
      : path === '/api/playback/live' ? { active: [{session_id: 1, id: 1, title: 'Interstellar', user_name: 'Alex', player: 'Apple TV', playback_method: 'direct_play', state: 'playing', duration_ms: 600000, progress_ms: 180000}, {session_id: 2, id: 2, title: 'The Last of Us', user_name: 'Marie', player: 'Navigateur', playback_method: 'transcode', state: 'playing', duration_ms: 600000, progress_ms: 280000}] }
      : path === '/api/arr/queue' ? [{queue_id: 1, title: 'Dune : Deuxième partie', instance: 'Radarr', status: 'downloading', progress: 72, size: 1000000000, sizeleft: 280000000, timeleft: '00:08:00'}]
      : ['/api/users', '/api/disk-space', '/api/scheduled-tasks'].includes(path) ? [] : {};
    await route.fulfill({ json });
  });
  await page.goto('/dashboard');
  for (const palette of ['cinema', 'mint', 'ocean', 'lavender', 'graphite']) {
    for (const appearance of ['light', 'dark']) {
      await page.evaluate(({ palette, appearance }) => {
        localStorage.setItem('watchdeck:palette', palette);
        localStorage.setItem('watchdeck:theme', appearance);
      }, { palette, appearance });
      await page.reload();
      await expect(page.locator('.dashboard-downloads')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-palette', palette);
      await expect(page.locator('html')).toHaveAttribute('data-theme', appearance);
      const layout = await page.evaluate(() => {
        const live = document.querySelector('.live-strip').getBoundingClientRect();
        const downloads = document.querySelector('.dashboard-downloads').getBoundingClientRect();
        const color = getComputedStyle(document.documentElement);
        return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
          liveAbove: live.bottom <= downloads.top, fullWidth: Math.abs(live.width - downloads.width) < 2,
          text: color.getPropertyValue('--text').trim(), bg: color.getPropertyValue('--bg').trim() };
      });
      expect(layout.overflow).toBe(false);
      expect(layout.liveAbove).toBe(true);
      expect(layout.fullWidth).toBe(true);
      expect(contrast(layout.text, layout.bg)).toBeGreaterThanOrEqual(4.5);
      if (palette === 'mint' && appearance === 'dark') await page.screenshot({path: testInfo.outputPath('accueil-menthe.png'), fullPage: true});
    }
  }
  await page.goto('/profile');
  const picker = page.getByRole('combobox', {name: 'Palette de l’interface'});
  await picker.click();
  await page.getByRole('option', {name: 'Menthe', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'mint');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('watchdeck:palette'))).toBe('mint');
});

function contrast(a, b) {
  const luminance = hex => {
    const c = hex.replace('#', '').match(/../g).map(v => parseInt(v, 16) / 255)
      .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (high + .05) / (low + .05);
}
