import { expect, test } from "@playwright/test";

/**
 * Inventaire : « Fichiers » est une page Explorer (tableau), « Insights » une page Analyser.
 */

const row = (id) => ({ id, title: `Film ${id}`, media_type: "movie", library: "Films", size_bytes: 4_000_000_000 * id, duration_ms: 7_200_000, play_count: id % 2, video_codec: "hevc", video_resolution: "1080", container: "mkv" });
const snapshot = {
  generated_at: "2026-10-12T10:00:00",
  summary: { items: 3, size_bytes: 24_000_000_000, duration_ms: 21_600_000, plays: 2, viewers: 1 },
  options: { library: ["Films"], studio: [], video_codec: ["hevc"], video_resolution: ["1080"], container: ["mkv"], audio_codec: [], audio_language: [], subtitle_language: [], subtitle_type: [], viewer: [] },
  insights: [{ kind: "storage", title: "Fichiers les plus volumineux", unit: "bytes", value: 24_000_000_000 }, { kind: "unwatched", title: "Jamais visionnés", unit: "count", value: 2 }],
  distributions: { types: [{ label: "movie", count: 3, percent: 100 }], studios: [], artists: [], video_codecs: [{ label: "hevc", count: 3, percent: 100 }], audio_codecs: [], resolutions: [], containers: [] },
};

async function mockApi(page, calls = []) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (url.pathname === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (url.pathname === "/api/library-analytics") return route.fulfill({ json: snapshot });
    if (url.pathname === "/api/library-analytics/items") return route.fulfill({ json: { items: [row(1), row(2), row(3)], total: 3, has_more: false } });
    return route.fulfill({ json: {} });
  });
}

test("les fichiers : compteur, filtres actifs en pastilles et tableau", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/analytics");
  await expect(page.locator(".explore")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".explore__count")).toContainText("3");
  await expect(page.getByRole("table")).toContainText("Film 2");
  // Un raccourci pose un filtre : il devient une pastille retirable, et le serveur est reinterroge.
  await page.getByRole("button", { name: /Jamais visionnés/ }).click();
  await expect(page.locator(".explore__chips")).toContainText("Jamais visionnés");
  await expect.poll(() => calls.some((call) => call.includes("watched=no"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test("les insights : chiffres, pistes, liste ouverte et répartitions", async ({ page }) => {
  await mockApi(page);
  await page.goto("/analytics?view=insights");
  await expect(page.locator(".analyze")).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Chiffres clés")).toContainText("Poids total");
  await expect(page.locator(".analyze__leads")).toContainText("Jamais visionnés");
  await expect(page.locator(".analyze__drill")).toContainText("Fichiers les plus volumineux");
  await page.getByRole("button", { name: /Jamais visionnés/ }).click();
  await expect(page.locator(".analyze__drill")).toContainText("Jamais visionnés");
  await expect(page.getByText("Codecs vidéo")).toBeVisible();
});
