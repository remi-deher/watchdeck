import { expect, test } from '@playwright/test';

test('la fiche et sa demande montrent le même parcours malgré un ancien statut disponible', async ({ page }) => {
  const availability = {
    plex: 'absent', library_id: null,
    episodes: { source: 'arr', state: 'unknown', available: null, aired: null, total: null },
    languages: { has_vf: null }, quality: { source: 'unknown', resolution: null },
  };
  const journey = {
    request_id: 8, origin: { kind: 'request', label: 'Demande via Seerr' },
    status: 'awaiting_plex', label: 'Import terminé, présence dans Plex à confirmer',
    steps: [
      { key: 'submitted', label: 'Transmis à *ARR', state: 'completed', occurred_at: null },
      { key: 'awaiting_plex', label: 'Confirmation Plex attendue', state: 'current', occurred_at: null },
      { key: 'completed', label: 'Disponible dans Plex', state: 'upcoming', occurred_at: null },
    ],
    blocker: null, next_step: { kind: 'plex', label: "Confirmer l'indexation dans Plex" },
    tracking: { kind: 'importing', label: 'Confirmation Plex attendue', since: null, download: null },
    availability,
  };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { role: 'admin', is_owner: true, plex_user_id: 'alice' } });
    if (path === '/api/users') return route.fulfill({ json: [] });
    if (path === '/api/media/detail') return route.fulfill({ json: {
      media: { id: 8, request_id: 8, title: 'Import test', media_type: 'movie', availability, journey },
      requests: [{ id: 8, title: 'Import test', media_type: 'movie', status: 'available', operational_status: 'completed',
        journey, availability, requesters: ['Alice'], requester_ids: ['alice'] }],
      timeline: [], calendar: [], notification_history: [],
    } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/library/media/request/8', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.workflow-timeline .is-current')).toHaveText(/Confirmation Plex attendue/, { timeout: 30_000 });
  await expect(page.locator('.state-card')).toContainText("Confirmer l'indexation dans Plex");
  await page.goto('/library/media/request/8?tab=requests', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.journey-title')).toHaveText(journey.label);
  await expect(page.locator('.journey-step.is-current')).toContainText('Confirmation Plex attendue');
  await expect(page.locator('.journey-card')).toContainText("Prochaine étape : Confirmer l'indexation dans Plex");
});
