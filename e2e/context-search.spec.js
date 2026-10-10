import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/events') return route.fulfill({ status: 204, contentType: 'text/event-stream', body: '' });
    if (url.pathname === '/api/session') return route.fulfill({ json: { role: 'admin', is_owner: true } });
    if (url.pathname === '/api/library') return route.fulfill({ json: [{ id: 12, title: 'Dune', media_type: 'movie' }] });
    if (url.pathname === '/api/discover/search') return route.fulfill({ json: { items: [{ id: 438631, tmdb_id: 438631, title: 'Dune', media_type: 'movie' }] } });
    if (url.pathname.includes('/fileflows/status')) return route.fulfill({ json: { configured: true, connected: true, paused: false } });
    return route.fulfill({ json: {} });
  });
});

test('la recherche garde un seul champ et la sheet remplace les filtres', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/discover/explore');
  const bar = page.locator('.app-topbar .ui-search-field');
  const input = bar.locator('input');
  await expect(input).toHaveAttribute('placeholder', 'Rechercher un film ou une série');
  await input.fill('Dune');
  await bar.getByRole('button', { name: 'Afficher plus' }).click();
  const sheet = page.locator('.filter-sheet[data-state="open"]');
  await expect(sheet).toHaveCount(1);
  await expect(sheet.getByText('Bibliothèque', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Découvrir', { exact: true })).toBeVisible();
  await expect(page.locator('.command-palette')).toHaveCount(0);
  await expect(sheet.locator('input')).toHaveCount(0);
  await input.fill('Dune II');
  await expect(input).toBeFocused();
  await expect(sheet).toHaveCount(1);
  // Même largeur et raccord sans espace, dans les deux positions de la barre.
  await expect.poll(async () => {
    const a = await bar.boundingBox();
    const b = await sheet.boundingBox();
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.width - b.width));
  }).toBeLessThan(2);
  await expect.poll(async () => {
    const a = await bar.boundingBox();
    const b = await sheet.boundingBox();
    return Math.min(Math.abs(a.y - b.y - b.height), Math.abs(b.y - a.y - a.height));
  }).toBeLessThan(2);
  await bar.getByRole('button', { name: /Afficher les filtres/ }).click();
  await expect(sheet).toHaveCount(1);
  await expect(sheet.getByText('Bibliothèque', { exact: true })).toHaveCount(0);
  await expect(input).toHaveValue('Dune II');
  expect(errors).toEqual([]);
});

test('sans recherche de page, la même barre reste utilisable et garde le focus', async ({ page }) => {
  await page.goto('/dashboard');
  const input = page.locator('.app-topbar .ui-search-field input');
  await page.keyboard.press('Control+k');
  await expect(input).toBeFocused();
  await input.pressSequentially('Dune');
  await expect(input).toHaveValue('Dune');
  await expect(input).toBeFocused();
  await expect(page.locator('.filter-sheet[data-state="open"]')).toHaveCount(1);
  await expect(page.locator('.app-topbar__search')).toHaveCount(0);
  await input.fill('');
  await expect(page.locator('.filter-sheet[data-state="open"]')).toHaveCount(0);
});
