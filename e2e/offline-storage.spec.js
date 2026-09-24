import { expect, test } from "@playwright/test";

/**
 * Stockage local : l'application se rouvre sur ce qu'elle savait deja.
 *
 * On charge la mediatheque, puis on recharge la page avec un serveur qui ne repond plus
 * (seule la session reste servie, comme un compte encore connecte) : la grille doit
 * s'afficher depuis IndexedDB, et le bandeau « hors ligne » apparaitre sans reseau.
 */

const item = (id) => ({ id, title: `Film conserve ${id}`, year: 2001, media_type: "movie", poster_url: `/poster/${id}.svg`, genres: [], has_vf: true });

test("la mediatheque se rouvre depuis le stockage local, serveur injoignable", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop", "le stockage ne depend pas de la largeur");
  let serveurEnPanne = false;
  await page.route("**/poster/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>' }));
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/session") return route.fulfill({ json: { id: 7, role: "admin", is_owner: true } });
    if (p === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (serveurEnPanne) return route.abort("connectionrefused");
    if (p === "/api/library") return route.fulfill({ json: Array.from({ length: 12 }, (_, i) => item(i + 1)) });
    if (p === "/api/requests-list") return route.fulfill({ json: { items: [], facets: {} } });
    if (p === "/api/requests/orphans") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto("/library?type=movie&query=Film");
  await expect(page.getByText("Film conserve 3").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500); // l'ecriture dans IndexedDB est regroupee

  serveurEnPanne = true;
  await page.reload();
  await expect(page.getByText("Film conserve 3").first()).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "Hors ligne" })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "Hors ligne" })).toBeHidden();
});

test("la deconnexion efface le stockage local", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "le lien de deconnexion vit dans la feuille du dock");
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/session") return route.fulfill({ json: { id: 7, role: "admin", is_owner: true } });
    if (p === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    return route.fulfill({ json: {} });
  });
  await page.route("**/logout", (r) => r.fulfill({ contentType: "text/html", body: "<p>deconnecte</p>" }));
  await page.goto("/dashboard");
  await expect(page.locator(".app-dock button").filter({ hasText: "Plus" })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => new Promise((ok) => {
    const req = indexedDB.open("watchdeck");
    req.onsuccess = () => {
      const tx = req.result.transaction("cache", "readwrite");
      tx.objectStore("cache").put("{}", "watchdeck-requetes:7");
      tx.oncomplete = ok;
    };
  }));
  await page.locator(".app-dock button").filter({ hasText: "Plus" }).click();
  await page.getByRole("link", { name: "Déconnexion" }).click();
  await expect(page.getByText("deconnecte")).toBeVisible();
  const restantes = await page.evaluate(() => new Promise((ok) => {
    const req = indexedDB.open("watchdeck");
    req.onsuccess = () => {
      const all = req.result.transaction("cache").objectStore("cache").getAllKeys();
      all.onsuccess = () => ok(all.result.filter((k) => String(k).startsWith("watchdeck-requetes:")));
    };
  }));
  expect(restantes).toEqual([]);
});
