import { expect, test } from "@playwright/test";

/**
 * Activité : cinq vues, chacune sur le gabarit de son besoin -- Analyser (vue d'ensemble,
 * qualité, utilisateurs), Suivre (en direct), Comprendre (historique).
 */

const session = (id, over = {}) => ({
  id, session_id: `s${id}`, title: id === 1 ? "Interstellar" : "The Bear", grandparent_title: id === 1 ? "" : "The Bear", user_name: id === 1 ? "Alex" : "Marie",
  player: "Apple TV", state: id === 2 ? "paused" : "playing", duration_ms: 600000, progress_ms: 180000, playback_method: id === 2 ? "transcode" : "direct_play",
  started_at: "2026-10-10T20:00:00", watched_ms: 600000, media_type: "movie", ...over,
});
const statistics = {
  summary: { sessions: 12, watch_ms: 36000000, transcode_rate: 25, transcodes: 3, direct_streams: 2, direct_stream_rate: 17 },
  daily: [{ date: "2026-10-09", sessions: 3 }, { date: "2026-10-10", sessions: 5 }],
  users: [{ name: "Alex", sessions: 7, watch_ms: 18000000, watch_change: 10, favorite_title: "Dune", favorite_device: "Apple TV", last_seen_at: "2026-10-10T21:00:00" }],
  history: [session(1), session(2)],
  analytics: {
    comparison: { sessions_change: 12, watch_change: -5 },
    engagement: { completed: 8, abandoned: 1, resumed: 2, rewatches: 0 },
    users: [{ name: "Alex", sessions: 7, watch_ms: 18000000, watch_change: 10, favorite_title: "Dune", favorite_device: "Apple TV", last_seen_at: "2026-10-10T21:00:00" }],
    quality: { methods: [{ key: "direct_play", count: 9 }, { key: "transcode", count: 3 }], resolutions: [{ label: "1080p", count: 8 }], codecs: [], devices: [{ device: "Apple TV", sessions: 8, transcodes: 1, compatibility_score: 90 }], coverage: { sessions: 12, method_known: 12, bandwidth_measured: 10 } },
    bandwidth: { average_kbps: 8000, p95_kbps: 20000, peak_kbps: 25000, measured: 10, by_user: [] },
    storage: { watch_hours_per_gb: 1.2, known_items: 40 },
    popular: [], popular_by_audience: [], heatmap: [], binges: [], completion: [], concurrency: { daily: [], peak: 2 },
  },
};

async function mockApi(page, calls = []) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push(`${route.request().method()} ${url.pathname}${url.search}`);
    const path = url.pathname;
    if (path === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (path === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (path === "/api/playback/live") return route.fulfill({ json: { active: [session(1), session(2)], enabled: true, configured: true } });
    if (path === "/api/playback/statistics") return route.fulfill({ json: statistics });
    if (path === "/api/playback/history") return route.fulfill({ json: { items: [session(1), session(2, { id: 3, started_at: "2026-10-09T20:00:00" })], total: 2, has_more: false, facets: { users: ["Alex", "Marie"], devices: ["Apple TV"], servers: [] } } });
    return route.fulfill({ json: path.startsWith("/api/playback/") ? [] : {} });
  });
}

test("la vue d'ensemble est une page Analyser : période comparée, chiffres clés, blocs", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/activity?view=overview");
  await expect(page.locator(".analyze")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".analyze__compare")).toContainText("Comparé aux 30 j précédents");
  await expect(page.getByLabel("Chiffres clés")).toContainText("Sessions");
  await expect(page.getByLabel("Chiffres clés")).toContainText("Temps regardé");
  await page.getByRole("button", { name: "7 j" }).click();
  await expect(page).toHaveURL(/days=7/);
  await expect.poll(() => calls.some((call) => call.includes("statistics?days=7"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test("la qualité est une page Analyser avec ses débits et ses répartitions", async ({ page }) => {
  await mockApi(page);
  await page.goto("/activity?view=quality");
  await expect(page.getByLabel("Chiffres clés")).toContainText("Débit moyen", { timeout: 15000 });
  await expect(page.getByText("Appareils et lecteurs")).toBeVisible();
});

test("les utilisateurs forment un annuaire ; une carte ouvre la vue d'ensemble restreinte", async ({ page }) => {
  await mockApi(page);
  await page.goto("/activity?view=users");
  await page.getByRole("button", { name: "Voir l’activité de Alex" }).click({ timeout: 15000 });
  await expect(page).not.toHaveURL(/view=users/);
});

test("l'en direct est une page Suivre : bandeau de l'Accueil, lecture en pause, lien vers l'historique", async ({ page }) => {
  await mockApi(page);
  await page.goto("/activity?view=live");
  await expect(page.locator(".track")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".track")).toContainText("Interstellar");
  await expect(page.locator(".track")).toContainText("En pause");
  await page.getByRole("link", { name: "Historique des lectures" }).click();
  await expect(page).toHaveURL(/view=history/);
});

test("l'historique est une page Comprendre : chronologie par jour, filtre de mode, fiche en feuille", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/activity?view=history");
  await expect(page.locator(".understand")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".understand__day")).toHaveCount(2);
  await page.getByRole("button", { name: "Transcodage", exact: true }).click();
  await expect.poll(() => calls.some((call) => call.includes("/api/playback/history") && call.includes("method=transcode"))).toBe(true);
  await page.getByRole("button", { name: /Interstellar/ }).first().click();
  await expect(page).toHaveURL(/\/activity\/session\/1/);
});
