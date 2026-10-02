import { expect, test } from "@playwright/test";

/**
 * Ce qui s'ouvre depuis une surface passe devant elle.
 *
 * La fiche media (feuille) etait empilee au-dessus des modales : la modale de demande,
 * ouverte depuis la fiche, s'affichait derriere, inatteignable. `toBeVisible` ne le voit
 * pas -- un element recouvert reste « visible » -- d'ou l'examen de l'element reellement
 * au premier plan, au centre de la modale.
 */

const catalog = {
  items: [{ tmdb_id: 1399, media_type: "show", title: "Série test", year: 2026, poster_url: null, requested: false, available: false, in_library: false }],
  page: 1,
  total_pages: 1,
  total_results: 1,
};
const detail = {
  tmdb_id: 1399, media_type: "show", title: "Série test", year: 2026, number_of_seasons: 2,
  requested: false, available: false, overview: "Synopsis.", cast: [], recommendations: [], similar: [],
};

/**
 * Rang d'empilement effectif d'un element : celui de son ancetre direct de <body>.
 * La modale et la fiche sont toutes deux teleportees dans <body> ; seul leur z-index les
 * departage. (`elementFromPoint` ne convient pas : une modale Reka coupe les evenements
 * du reste de la page, qu'il ignore alors meme s'il la recouvre a l'ecran.)
 */
function layer(locator) {
  return locator.evaluate((node) => {
    let n = node;
    while (n.parentElement && n.parentElement !== document.body) n = n.parentElement;
    return Number(getComputedStyle(n).zIndex) || 0;
  });
}

test("la modale de demande ouverte depuis la fiche passe devant elle", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (url.pathname === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (url.pathname === "/api/discover/detail") return route.fulfill({ json: detail });
    if (url.pathname === "/api/discover/genres") return route.fulfill({ json: [] });
    if (url.pathname.startsWith("/api/discover/")) return route.fulfill({ json: catalog });
    return route.fulfill({ json: {} });
  });
  await page.goto("/discover/shows", { waitUntil: "domcontentloaded" });

  await page.getByRole("link", { name: /Série test/ }).first().click();
  const sheet = page.locator(".media-overlay__panel");
  await expect(sheet).toBeVisible();

  const cta = sheet.getByRole("button", { name: "Demander la série" });
  await cta.click();
  const dialog = page.getByRole("dialog", { name: /Options de la demande/ });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400); // fin de l'animation d'ouverture
  const sheetLayer = await layer(page.locator(".media-overlay"));
  expect(await layer(dialog)).toBeGreaterThan(sheetLayer);
  expect(await layer(page.locator(".drawer-backdrop--request-options-modal"))).toBeGreaterThan(sheetLayer);
  // Et la modale repond : cocher une saison fonctionne.
  await dialog.getByLabel("Saison 2").click();
  await expect(dialog.getByLabel("Saison 2")).not.toBeChecked();
});

test("l'echelle d'empilement met modales et confirmations devant les feuilles", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: new URL(route.request().url()).pathname === "/api/session" ? { role: "admin", is_owner: true } : {} }));
  await page.goto("/dashboard");
  const z = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(["sheet", "modal", "modal-panel", "confirm", "confirm-panel", "toast", "popover", "tooltip"]
      .map((name) => [name, Number(style.getPropertyValue(`--z-${name}`))]));
  });
  expect(z.sheet).toBeLessThan(z.modal);
  expect(z.modal).toBeLessThan(z["modal-panel"]);
  expect(z["modal-panel"]).toBeLessThan(z.confirm);
  expect(z.confirm).toBeLessThan(z["confirm-panel"]);
  expect(z["confirm-panel"]).toBeLessThan(z.popover);
  expect(z.popover).toBeLessThan(z.tooltip);
});
