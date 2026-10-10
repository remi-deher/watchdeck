import { expect, test } from '@playwright/test';

const work = (key, state, percent = null) => ({
  key, source: key.startsWith('scan:') ? 'scan' : 'task', state,
  label: { running: 'En cours', unknown: 'État inconnu', blocked: 'À traiter' }[state],
  stage: null, progress: { percent, scope: 'items', label: 'Éléments traités' },
  reason: state === 'blocked' ? 'Connexion perdue pendant la tâche' : null, stale: false,
});

async function fixtures(page) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: '' });
    if (path.endsWith('/stream')) return route.abort();
    const json = path === '/api/session' ? { role: 'admin', is_owner: true }
      : path === '/api/settings' ? { plex_url: 'http://plex', vff_enabled: true }
      : path === '/api/health' ? { status: 'healthy', checked_at: new Date().toISOString(), services: {
        plex: { state: 'ok', health: { key: 'plex', state: 'unknown', label: 'État inconnu', reason: null } },
      } }
      : path === '/api/scheduled-tasks' ? [
        { job: 'watchlist', label: 'Watchlist Plex', interval_seconds: 300, state: { status: 'complete' }, work: work('task:watchlist', 'unknown') },
        { job: 'arr-statuses', label: 'Vérification ARR', interval_seconds: 900, state: { status: 'complete' }, work: work('task:arr-statuses', 'blocked') },
      ]
      : path === '/api/vff/sync-status' ? { status: 'idle', items_synced: 0, total_items: 10, work: work('scan:plex', 'running', 0) }
      : path === '/api/playback/live' ? { active: [] }
      : ['/api/users', '/api/arr/queue', '/api/disk-space'].includes(path) ? [] : {};
    return route.fulfill({ json });
  });
}

test('les tâches lisent leur état observé et la cause entière', async ({ page }) => {
  await fixtures(page);
  await page.goto('/settings/automation/scheduled-tasks');
  const table = page.locator('.scheduled-table');
  await expect(table).toContainText('Connexion perdue pendant la tâche', { timeout: 30000 });
  await expect(table).toContainText('État inconnu');
  await expect(page.locator('.scheduled-verdict')).toContainText('1 tâche en échec');
});

test('la supervision conserve un scan à zéro et une santé inconnue', async ({ page }) => {
  await fixtures(page);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /Supervision/ }).click();
  await expect(page.locator('.service-health')).toContainText('État inconnu', { timeout: 30000 });
  await expect(page.locator('.service-health-verdict')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Vérifier à nouveau' })).toHaveCount(0);
  const scan = page.locator('.scan-status-panel .live-card');
  await expect(scan).toContainText('0 %');
  await expect(scan.locator('.live-card-track i')).toHaveAttribute('style', /width: 0%/);
});
