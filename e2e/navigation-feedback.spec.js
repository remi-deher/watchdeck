import { expect, test } from "@playwright/test";

/**
 * Cliquer une entree du menu dont la vue n'est pas encore chargee : l'ecran ne doit pas
 * rester muet. La barre de progression s'allume, l'entree touchee reste enfoncee, puis tout
 * s'eteint a l'arrivee.
 */
test("une destination lente montre un retour immédiat, puis l'efface à l'arrivée", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "le rail suffit pour ce contrôle");
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (p === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    return route.fulfill({ json: {} });
  });
  // La vue visee arrive avec retard : le routeur doit attendre, et l'interface le dire.
  // Posee avant le chargement, pour que le prechargement d'avance soit retenu lui aussi.
  let libere;
  const attente = new Promise((resolve) => { libere = resolve; });
  await page.route(/DownloadsView/, async (route) => { await attente; await route.continue(); });

  await page.goto("/discover");
  await expect(page.locator('a.app-nav-link[href^="/downloads"]').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

  const lien = page.locator('a.app-nav-link[href^="/downloads"]').first();
  await lien.click();
  await expect(page.locator(".ui-nav-progress")).toBeVisible({ timeout: 1500 });
  await expect(lien).toHaveAttribute("data-pending", "true");

  libere();
  await expect(page).toHaveURL(/\/downloads/);
  await expect(page.locator(".ui-nav-progress")).toHaveCount(0, { timeout: 5000 });
  await expect(lien).not.toHaveAttribute("data-pending", /.*/);
});
