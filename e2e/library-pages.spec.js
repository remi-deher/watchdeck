import { expect, test } from "@playwright/test";

/**
 * Bibliotheque sur gabarits : sans filtre, des rangees a parcourir (gabarit Parcourir) ; des
 * qu'une recherche ou un filtre affine, une grille a explorer (gabarit Explorer) avec le
 * nombre de resultats et les filtres actifs en pastilles retirables.
 */
const film = (id, extra = {}) => ({ id, title: `Film ${id}`, year: 2010 + id, media_type: "movie", poster_url: `/poster/${id}.svg`, genres: ["Drame"], has_vf: id % 2 === 0, ...extra });

async function mock(page, calls) {
  await page.route("**/poster/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>' }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (path === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (path === "/api/library") { calls.push(url.search); return route.fulfill({ json: Array.from({ length: 12 }, (_, i) => film(i + 1)) }); }
    if (path === "/api/library-genres") return route.fulfill({ json: [] });
    if (path === "/api/requests-list") return route.fulfill({ json: { items: [], facets: {} } });
    if (path === "/api/requests/orphans") return route.fulfill({ json: [] });
    if (path === "/api/library-servers") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
}

test("sans filtre, la bibliotheque se parcourt en rangees ; une recherche bascule en grille", async ({ page }) => {
  const calls = [];
  await mock(page, calls);
  await page.goto("/library?hub=1");
  await expect(page.getByRole("button", { name: "Derniers ajouts" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".browse")).toBeVisible();
  await expect(page.locator(".explore")).toHaveCount(0);

  await page.locator(".ui-search-field input, input[type=search]").first().fill("Film 3");
  await expect(page.locator(".explore")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".explore__count")).toContainText("média");
  await expect(page.locator(".media-grid > .poster-card").first()).toBeVisible();
});

test("une grille filtree montre ses pastilles et « Tout effacer » revient au hub", async ({ page }) => {
  const calls = [];
  await mock(page, calls);
  await page.goto("/library?type=movie&vf=vf");
  await expect(page.locator(".explore")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".explore__chips")).toContainText("VF uniquement");
  await expect(page.locator(".media-grid > .poster-card").first()).toBeVisible();
  expect(calls.some((c) => c.includes("vf=vf"))).toBe(true);

  await page.locator(".explore__chips button, .explore__chips [role=button]").first().click();
  await expect(page.locator(".explore__chips")).toHaveCount(0);
});
