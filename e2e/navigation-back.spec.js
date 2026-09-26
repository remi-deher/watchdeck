import { expect, test } from "@playwright/test";

/**
 * Le geste « retour » (bouton Android, bord de l'ecran sur iPhone) et la memoire des filtres.
 *
 * Les panneaux et modales ne poussent plus d'entree d'historique : un retour avec un
 * panneau ouvert le ferme et reste sur la page, et un filtre choisi dans le panneau ne peut
 * plus etre annule par le retour suivant. Les filtres d'une page survivent a un passage par
 * une autre page, le temps de la session.
 *
 * Le retour est declenche par `history.back()` et non `page.goBack()` : quand un panneau
 * est ouvert, la navigation est annulee, et `goBack` attendrait une page qui ne vient pas.
 */

const USERS = [
  { id: 1, custom_name: "Alice" },
  { id: 2, display_name: "Bruno" },
];
const TORRENTS = [
  { client_id: 7, client_name: "Maison", hash: "aaa", title: "Alpha.2024.1080p", status: "downloading", progress: 50, category: "films" },
  { client_id: 7, client_name: "Maison", hash: "bbb", title: "Bravo.S01", status: "pausedDL", progress: 10, category: "series" },
];

async function mockApi(page) {
  const calls = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname + url.search);
    const json = {
      "/api/session": { role: "admin", is_owner: true },
      "/api/users": USERS,
      "/api/download-clients": [{ id: 7, name: "Maison", enabled: true }],
      "/api/arr-instances": [],
      "/api/downloads/clients": TORRENTS,
      "/api/downloads/global-stats": { connected: 1, total: 1 },
      "/api/notifications/log": { items: [], total: 0 },
    }[url.pathname];
    await route.fulfill({ json: json ?? {} });
  });
  return calls;
}

async function retour(page) {
  await page.evaluate(() => history.back());
}

/* Navigation DANS l'application, par son routeur, comme un clic sur un lien : un
   `page.goto` charge un document neuf, et le retour suivant rechargeait toute
   l'application au lieu de rester une navigation interne -- le garde du retour n'etait
   alors jamais sollicite. */
async function allerA(page, adresse) {
  // Le routeur doit avoir fini sa navigation initiale : pousse avant, la nouvelle adresse
  // remplacait l'entree de depart au lieu de s'y ajouter, et le retour sortait de l'app.
  await page.waitForFunction(() => Boolean(document.querySelector("#app")?.__vue_app__));
  await page.evaluate(async (cible) => {
    const router = document.querySelector("#app").__vue_app__.config.globalProperties.$router;
    await router.isReady();
    await router.push(cible);
  }, adresse);
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(adresse);
}

/* Le panneau de filtres n'est une feuille (une surface a fermer) que sur petit ecran. */
test.describe("retour avec un panneau ouvert", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("le retour ferme le panneau de filtres sans quitter la page, puis quitte la page", async ({ page }) => {
    await mockApi(page);
    await page.goto("/notifications?tab=history");
    await allerA(page, "/downloads?view=clients&sub=instances");
    await expect(page.locator(".torrent-table")).toContainText("Alpha.2024.1080p");

    await page.getByRole("button", { name: "Afficher les filtres" }).first().click();
    const panneau = page.getByRole("dialog", { name: "Filtres" });
    await expect(panneau).toBeVisible();
    const historiqueAvant = await page.evaluate(() => history.length);

    await retour(page);
    await expect(panneau).toBeHidden();
    await expect(page).toHaveURL(/\/downloads\?view=clients&sub=instances/);
    // Aucune entree fantome : l'historique n'a pas grandi a l'ouverture du panneau.
    expect(await page.evaluate(() => history.length)).toBe(historiqueAvant);

    await retour(page);
    await expect(page).toHaveURL(/\/notifications\?tab=history/);
  });

  test("un filtre choisi dans le panneau n'est pas annule par le retour suivant", async ({ page }) => {
    await mockApi(page);
    await page.goto("/notifications?tab=history");
    await allerA(page, "/downloads?view=clients&sub=instances");
    const table = page.locator(".torrent-table");
    await expect(table).toContainText("Bravo.S01");

    await page.getByRole("button", { name: "Afficher les filtres" }).first().click();
    await page.getByRole("group", { name: "Catégorie" }).getByRole("button", { name: /^films/ }).click();
    await expect(table).not.toContainText("Bravo.S01");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Filtres" })).toBeHidden();

    // Autrefois : ce retour revenait a la page SANS le filtre. Il doit quitter la page.
    await retour(page);
    await expect(page).toHaveURL(/\/notifications\?tab=history/);
  });

  test("le retour ferme d'abord la surface du dessus", async ({ page }) => {
    await mockApi(page);
    await page.goto("/notifications?tab=history");
    await allerA(page, "/downloads?view=clients&sub=instances");
    await page.getByRole("button", { name: "Afficher les filtres" }).first().click();
    await expect(page.getByRole("dialog", { name: "Filtres" })).toBeVisible();
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog").filter({ has: page.getByRole("combobox") }).last();
    await expect(palette).toBeVisible();

    await retour(page);
    await expect(palette).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Filtres" })).toBeVisible();
    await retour(page);
    await expect(page.getByRole("dialog", { name: "Filtres" })).toBeHidden();
    await expect(page).toHaveURL(/\/downloads\?view=clients&sub=instances/);
  });
});

test.describe("memoire des filtres", () => {
  test("les filtres d'une page sont retrouves apres un passage par une autre page", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/notifications?tab=history");

    const input = page.getByRole("combobox", { name: "Utilisateur" });
    if (!(await input.isVisible())) await page.getByRole("button", { name: "Afficher les filtres" }).first().click();
    await input.click();
    await input.fill("bru");
    await page.getByRole("listbox").getByRole("option", { name: "Bruno" }).click();
    await expect.poll(() => calls.some((c) => c.startsWith("/api/notifications/log") && c.includes("users=2"))).toBe(true);

    await page.goto("/downloads?view=clients&sub=instances");
    calls.length = 0;
    await page.goto("/notifications?tab=history");
    await expect.poll(() => calls.some((c) => c.startsWith("/api/notifications/log") && c.includes("users=2"))).toBe(true);
  });

  test("une page a adresse retrouve sa section quand on y revient sans adresse", async ({ page }) => {
    await mockApi(page);
    await page.goto("/downloads?view=clients&sub=instances");
    await expect(page.locator(".torrent-table")).toBeVisible();
    await page.goto("/notifications?tab=history");

    await page.goto("/downloads");
    await expect(page).toHaveURL(/\/downloads\?.*view=clients/);
    await expect(page.locator(".torrent-table")).toBeVisible();
  });

  test("une adresse explicite garde le dernier mot sur la memoire", async ({ page }) => {
    await mockApi(page);
    await page.goto("/downloads?view=clients&sub=instances");
    await page.goto("/downloads?view=queue");
    await expect(page).toHaveURL(/\/downloads\?view=queue/);
  });
});
