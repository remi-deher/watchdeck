import { expect, test } from "@playwright/test";

async function openLazyRoute(page, path) {
  await page.goto(path);
  const heading = page.getByRole("heading", { level: 1 });
  try {
    await expect(heading).toBeVisible({ timeout: 5_000 });
  } catch {
    // Le serveur Vite peut interrompre ponctuellement la transformation d'un
    // module paresseux sous forte concurrence. Une navigation fraîche reproduit
    // la récupération attendue en production après invalidation d'un chunk.
    await page.reload();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  }
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === "/api/session" ? { role: "admin", is_owner: true } : {};
    await route.fulfill({ json: body });
  });
  await page.goto("/dashboard");
});

test("navigation remains usable at the configured viewport", async ({ page }) => {
  // La session est chargee par le garde de route : sous forte concurrence elle arrive
  // apres le premier rendu, et la navigation reste vide le temps de connaitre les
  // droits. On attend donc que la page soit reellement etablie avant de l'observer.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

  // Une seule navigation, deux orientations : rail vertical au-dela du seuil, barre en
  // bas en deca. Une seule des deux est montee a la fois -- il n'y a plus de sidebar
  // repliable ni de barre masquee en CSS.
  const rail = page.locator(".app-nav--rail");
  const bar = page.locator(".app-nav--bar");
  const surface = page.viewportSize().width <= 640 ? bar : rail;
  const other = page.viewportSize().width <= 640 ? rail : bar;

  await expect(other).toBeHidden();
  await expect(surface).toBeVisible();

  // La surface porte les sections de l'espace courant. On verifie l'invariant --
  // au moins une section joignable -- et non des libelles precis, qui dependent des
  // droits de la session et sont deja couverts par les tests unitaires d'AppNav.
  await expect(surface.locator(".app-nav-items a").first()).toBeVisible();

  // Les autres espaces et le compte vivent derriere le bouton dedie, dans les deux
  // orientations.
  await page.getByRole("button", { name: /Espaces et compte/ }).click();
  const menu = page.getByRole("dialog", { name: "Espaces et compte" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Découvrir" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Profil" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);
});

test("library filters use the responsive filter shell", async ({ page }) => {
  // Les filtres Bibliothèque (MediaFiltersBar.vue) s'ouvrent dans une ModalShell
  // (.modal-panel) déclenchée par .filter-modal-trigger, identique sur mobile/tablette/
  // desktop -- pas de panneau compact qui se replie/déplie selon la largeur.
  await page.goto("/library");
  const trigger = page.getByRole("button", { name: "Afficher les filtres" });
  const modal = page.locator(".modal-panel");
  const sidebar = page.locator(".filter-sidebar");

  await expect(trigger).toBeVisible();
  await trigger.click();
  if (page.viewportSize().width <= 900) {
    await expect(modal).toBeVisible();
    await page.getByRole("button", { name: "Fermer" }).click();
    await expect(modal).toBeHidden();
  } else {
    await expect(sidebar).toBeVisible();
    await page.getByRole("button", { name: "Masquer les filtres" }).click();
    await expect(sidebar).toBeHidden();
  }
});

test("activity and insights share the responsive space shell", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  for (const path of ["/activity", "/analytics"]) {
    await openLazyRoute(page, path);

    if (page.viewportSize().width <= 640) {
      for (const width of [320, 375, 430]) {
        await page.setViewportSize({ width, height: 844 });
        if (path === "/activity") {
          await expect(page.locator(".adaptive-tabs-select select")).toBeVisible();
          await expect(page.locator(".detail-tabs")).toBeHidden();
        } else {
          await expect(page.locator(".detail-tabs")).toBeVisible();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      }
    } else {
      await expect(page.locator(".detail-tabs")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    }
  }
});
