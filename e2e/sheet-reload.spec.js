import { expect, test } from "@playwright/test";

/* Recharger une fiche ouverte par-dessus une page : la page de fond est restauree par
   son adresse, mais sa vue n'etait jamais chargee (vue paresseuse) et le fond affichait
   « [object Promise] » a la place de la grille. */
const item = (id) => ({ id, title: `Film ${id}`, year: 2001, media_type: "movie", poster_url: `/poster/${id}.svg`, genres: [], has_vf: true });

test.beforeEach(async ({ page }) => {
  await page.route("**/poster/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>' }));
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (p === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (p === "/api/library") return route.fulfill({ json: Array.from({ length: 6 }, (_, i) => item(i + 1)) });
    if (p === "/api/requests-list") return route.fulfill({ json: { items: [], facets: {} } });
    if (p === "/api/requests/orphans") return route.fulfill({ json: [] });
    if (p.startsWith("/api/media/detail")) return route.fulfill({ json: { ...item(1), media: {}, requests: [] } });
    return route.fulfill({ json: {} });
  });
});

test("recharger une fiche ouverte depuis une page garde la page de fond", async ({ page }) => {
  await page.goto("/library?type=movie&query=Film");
  await expect(page.getByText("6 médias affichés")).toBeVisible({ timeout: 15_000 });
  await page.goto("/library?type=movie&query=Film");
  await page.locator(".media-grid > .poster-card a, .media-grid > .poster-card [role=link]").first().click();
  if (!(await page.locator(".media-overlay__panel").isVisible())) {
    // Au doigt, le premier appui revele la carte : le second ouvre la fiche.
    await page.locator(".media-grid > .poster-card a, .media-grid > .poster-card [role=link]").first().click();
  }
  await expect(page.locator(".media-overlay__panel")).toBeVisible();

  await page.reload();
  await expect(page.locator(".media-overlay__panel")).toBeVisible({ timeout: 15_000 });
  const main = page.locator("#main-content");
  await expect(main).not.toContainText("[object Promise]");
  await expect(main.getByText("6 médias affichés")).toBeVisible({ timeout: 15_000 });
});
