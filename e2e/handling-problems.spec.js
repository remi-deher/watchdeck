import { expect, test } from '@playwright/test';

test('un signalement garde ses images, sa note et un changement d’état annulable', async ({ page }) => {
  await page.route('**/*.jpg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"><rect width="100" height="150" fill="#345"/></svg>' }));
  let status = 'open';
  let note = '';
  const problem = () => ({ key: 'report:4', source: 'report', kind: 'audio', label: 'Problème audio', state: status,
    urgency: status === 'closed' ? 'low' : 'medium', consequence: 'La cause reste à vérifier.', proposal: 'Vérifier les pistes', fixable: false,
    actions: status === 'closed' ? [{ key: 'open', label: 'Rouvrir' }] : [
      { key: 'investigating', label: 'Prendre en charge', tone: 'primary' },
      { key: 'retry', label: 'Relancer la recherche', disabled: true, title: 'Média non associé à une instance Sonarr/Radarr' },
      { key: 'closed', label: 'Clore' },
    ] });
  const issue = () => ({ id: 4, title: 'Dune', issue_type: 'audio', media_type: 'movie', status,
    message: 'Pas de piste française', reporter_name: 'Alice', created_at: '2026-10-09T12:00:00', admin_note: note,
    library_item_id: 9, request_id: null, problem: problem(),
    media: { id: 9, title: 'Dune', year: 2021, media_type: 'movie', poster_url: '/poster.jpg', backdrop_url: '/fanart.jpg' } });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/session') return route.fulfill({ json: { role: 'admin', is_owner: true, plex_user_id: 'alice' } });
    if (url.pathname === '/api/users') return route.fulfill({ json: [] });
    if (url.pathname === '/api/media/issues/4' && route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      status = body.status ?? status;
      note = body.admin_note ?? note;
      return route.fulfill({ json: issue() });
    }
    if (url.pathname === '/api/media/issues') return route.fulfill({ json: {
      items: url.searchParams.get('status') === status || url.searchParams.get('status') === 'all' ? [issue()] : [],
      types: ['audio'], type_labels: { audio: 'Problème audio' },
    } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/issues', { waitUntil: 'domcontentloaded' });
  const row = page.locator('.handle-row');
  await expect(row).toContainText('Dune', { timeout: 30000 });
  await expect(row.locator('img')).toHaveAttribute('src', /poster.jpg/);
  await expect(row.locator('.handle-row__backdrop')).toHaveAttribute('style', /fanart.jpg/);
  await expect(row.getByRole('button', { name: 'Relancer la recherche' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await row.getByRole('textbox', { name: 'Note interne' }).fill('Vérifié dans Plex');
  await row.getByRole('textbox', { name: 'Note interne' }).blur();
  await expect.poll(() => note).toBe('Vérifié dans Plex');
  await row.getByRole('button', { name: 'Clore', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(row).toContainText('Dune');
  await expect(row.getByRole('textbox')).toHaveValue('Vérifié dans Plex');
});
