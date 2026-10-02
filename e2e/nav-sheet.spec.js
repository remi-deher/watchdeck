import { expect, test } from "@playwright/test";

/**
 * La feuille de navigation ne se referme pas toute seule pendant le chargement.
 *
 * Le shell et son dock s'affichent pendant que le code de la page d'arrivee se charge
 * encore. Une feuille ouverte a ce moment-la se refermait des que la navigation
 * initiale aboutissait : AppShell referme ses feuilles a chaque changement de route,
 * et prenait cette resolution pour une navigation. Sur une machine lente, le menu
 * « Plus » se refermait sans raison (c'est aussi ce qui faisait echouer, sous charge,
 * « toute destination est atteignable au clavier seul »).
 *
 * Le chargement de la page est ici retarde volontairement, pour rendre le cas
 * deterministe au lieu d'attendre qu'une machine chargee le produise.
 */
test("la feuille ouverte pendant le chargement de la page reste ouverte", async ({ page }, info) => {
  test.skip(!["mobile", "ios"].includes(info.project.name), "le dock et sa feuille n'existent qu'en compact");
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (path === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    return route.fulfill({ json: {} });
  });
  // Retient le module de la page d'accueil : la navigation initiale reste en suspens.
  let releaseDashboard;
  const dashboardHeld = new Promise((resolve) => { releaseDashboard = resolve; });
  await page.route("**/views/DashboardView.vue**", async (route) => {
    await dashboardHeld;
    await route.continue();
  });

  await page.goto("/dashboard", { waitUntil: "commit" });
  const trigger = page.locator(".app-dock button").filter({ hasText: "Plus" });
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Navigation" });
  await expect(sheet).toBeVisible();

  // La page arrive : la navigation initiale aboutit, la feuille doit rester ouverte.
  releaseDashboard();
  await expect(page.locator("#main-content h1").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await expect(sheet).toBeVisible();

  // Une vraie navigation la referme toujours.
  await sheet.getByRole("link", { name: "Explorer" }).click();
  await expect(page).toHaveURL(/\/discover/);
  await expect(sheet).toBeHidden();
});
