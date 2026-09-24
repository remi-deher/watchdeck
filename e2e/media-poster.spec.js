import { expect, test } from "@playwright/test";

/**
 * L'affiche d'une fiche garde son format 2:3, dans la feuille comme en pleine page.
 * Sur telephone l'en-tete s'empile en colonne : une base flex fixee y reglait la hauteur,
 * et l'affiche devenait un carre.
 */

const catalog = { items: [{ tmdb_id: 1399, media_type: "show", title: "Série test", year: 2026, poster_url: "/poster/1.svg" }], page: 1, total_pages: 1, total_results: 1 };
const detail = { tmdb_id: 1399, media_type: "show", title: "Série test", year: 2026, number_of_seasons: 2, overview: "Synopsis.", poster_url: "/poster/1.svg", cast: [], recommendations: [], similar: [] };

async function ratio(locator) {
  const box = await locator.boundingBox();
  return box.height / box.width;
}

test("l'affiche d'une fiche reste au format 2:3", async ({ page }) => {
  await page.route("**/poster/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"/>' }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (url.pathname === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (url.pathname === "/api/discover/detail") return route.fulfill({ json: detail });
    if (url.pathname.startsWith("/api/discover/")) return route.fulfill({ json: catalog });
    return route.fulfill({ json: {} });
  });

  // Dans la feuille.
  await page.goto("/discover/shows");
  await page.getByRole("link", { name: /Série test/ }).first().click();
  const inSheet = page.locator(".media-overlay .mdh-poster");
  await expect(inSheet).toBeVisible();
  await page.waitForTimeout(600); // fin de l'ouverture
  expect(await ratio(inSheet)).toBeCloseTo(1.5, 1);

  // En pleine page.
  await page.goto("/discover/media/discover/1399?media_type=show");
  const fullPage = page.locator(".mdh-poster");
  await expect(fullPage).toBeVisible();
  expect(await ratio(fullPage)).toBeCloseTo(1.5, 1);
});
