import { expect, test } from "@playwright/test";

/* Au doigt, une affiche se revele au premier appui et ne s'ouvre qu'au second.
   Le comportement tenait a une heuristique de Safari (annuler le clic quand le survol
   simule change la page) : quand elle a cesse de s'appliquer, le premier appui ouvrait
   directement la fiche. `tap()` envoie de vrais evenements tactiles, precedes du survol
   simule, comme un telephone. */
test.skip(({ hasTouch }) => !hasTouch, "Appuis tactiles uniquement");

const item = (id) => ({ id, title: `Film ${id}`, year: 2001, media_type: "movie", poster_url: `/poster/${id}.svg`, genres: [], has_vf: true });

test.beforeEach(async ({ page }) => {
  await page.route("**/poster/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>' }));
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (p === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (p === "/api/library") return route.fulfill({ json: Array.from({ length: 12 }, (_, i) => item(i + 1)) });
    if (p === "/api/requests-list") return route.fulfill({ json: { items: [], facets: {} } });
    if (p === "/api/requests/orphans") return route.fulfill({ json: [] });
    if (p.startsWith("/api/media/detail")) return route.fulfill({ json: { ...item(1), media: {}, requests: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/library?type=movie&query=Film");
});

test("une affiche se revele au premier appui et s'ouvre au second", async ({ page }) => {
  const carte = page.locator(".media-grid > .poster-card").first();
  const affiche = carte.locator(".poster-wrap");
  await expect(affiche).toBeVisible({ timeout: 15_000 });

  await affiche.tap();
  await expect(affiche).toHaveClass(/revealed/);
  await expect(page.locator(".media-overlay__panel")).toHaveCount(0);

  await affiche.tap();
  await expect(page.locator(".media-overlay__panel")).toBeVisible();
});
