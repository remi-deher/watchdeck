import { expect, test } from "@playwright/test";

/** Fichier média (gabarit Fiche) : en-tête, caractéristiques en badges, trois parties. */

const ITEM = {
  rating_key: "1", title: "Épisode 1", grandparent_title: "Foundation", media_type: "episode", year: 2025,
  library: "Séries", studio: "Apple", video_resolution: "4k", video_codec: "hevc", container: "mkv", audio_codec: "eac3",
  audio_languages: ["Français"], size_bytes: 2_000_000_000, play_count: 1, viewers: ["Rémi"], duration_ms: 3_600_000,
  views: [{ user: "Rémi", at: "2026-09-21T20:42:00", watched_ms: 2_700_000 }],
};

test("la fiche d'un fichier : en-tête, badges, puis fichier, pistes et visionnages", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (path === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (path === "/api/library-analytics/items/1") return route.fulfill({ json: ITEM });
    if (path === "/api/library-analytics/items/1/technical") return route.fulfill({ json: { file: { path: "/media/x.mkv" }, audio: [], subtitles: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/analytics/item/1");
  await expect(page.locator(".detail__title")).toHaveText("Épisode 1");
  await expect(page.locator(".detail__meta")).toContainText("Foundation");
  await expect(page.getByRole("list", { name: "État" })).toContainText("4K");
  await expect(page.locator("#item-file-title")).toBeVisible();

  await page.getByRole("tab", { name: "Visionnages" }).click();
  await expect(page.getByText("75 %")).toBeVisible();
});
