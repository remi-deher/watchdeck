import { expect, test } from "@playwright/test";

/**
 * L'apparition des affiches ne doit se jouer qu'une fois.
 *
 * La grille rend ses cartes hors ecran en `content-visibility: auto`. Tant qu'une
 * animation restait attachee a la carte (animation liee au defilement, ou animation
 * d'arrivee jamais retiree), chaque retour a l'ecran la relancait : sur 1 000 affiches,
 * le defilement tombait a une image toutes les 70 a 100 ms. Ce test verifie la
 * propriete qui l'empeche : une fois apparue, une carte n'a plus d'animation active.
 */

test("les cartes apparaissent une fois puis restent visibles", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("**/poster/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>' }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (url.pathname === "/api/library") return route.fulfill({ json: Array.from({ length: 60 }, (_, i) => ({ id: i + 1, title: `Film ${i + 1}`, year: 2020, media_type: "movie", poster_url: `/poster/${i}.svg`, genres: [], has_vf: true })) });
    if (url.pathname === "/api/requests-list") return route.fulfill({ json: { items: [], facets: {} } });
    // La mediatheque attend une LISTE d'orphelins *arr : `{}` la faisait echouer.
    if (url.pathname === "/api/requests/orphans") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/library?type=movie&query=Film");
  const cards = page.locator(".media-grid > .poster-card");
  await expect(cards).toHaveCount(60, { timeout: 15000 });
  // Toutes les cartes visibles a l'ecran ont fini d'apparaitre et perdu la classe.
  await expect.poll(() => page.evaluate(() => {
    const visible = [...document.querySelectorAll(".media-grid > .poster-card")].filter((c) => c.getBoundingClientRect().top < innerHeight);
    return visible.every((c) => !c.classList.contains("animated") && getComputedStyle(c).opacity === "1") && visible.length > 0;
  }), { timeout: 5000 }).toBe(true);
  // En bas de page, apres defilement, les cartes sont visibles et ne se rejouent pas.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(800);
  const bottom = await page.evaluate(() => {
    const list = [...document.querySelectorAll(".media-grid > .poster-card")].filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
    return { count: list.length, opaque: list.every((c) => getComputedStyle(c).opacity === "1"), replaying: list.filter((c) => c.getAnimations().length).length };
  });
  console.log("BOTTOM " + JSON.stringify(bottom));
  expect(bottom.opaque).toBe(true);
  expect(bottom.replaying).toBe(0);
});
