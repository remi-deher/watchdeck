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

test("navigation remains usable at the configured viewport", async ({ page }, testInfo) => {
  const desktopSidebar = page.locator(".sidebar");
  const mobileNavigation = page.locator(".mobile-nav-bar");

  if (page.viewportSize().width <= 640) {
    await expect(desktopSidebar).toBeHidden();
    await expect(mobileNavigation).toBeVisible();
    await page.getByRole("button", { name: "Ouvrir le menu principal" }).click();
    await expect(page.getByRole("heading", { name: "Menu" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Telechargements" })).toBeVisible();
  } else {
    await expect(desktopSidebar).toBeVisible();
    await expect(mobileNavigation).toBeHidden();

    if (testInfo.project.name === "tablet") {
      await page.getByRole("button", { name: "Afficher le menu" }).click();
      await expect(desktopSidebar).toHaveAttribute("aria-expanded", "true");
    } else {
      await page.getByRole("button", { name: "Réduire le menu" }).click();
      await expect(desktopSidebar).toHaveAttribute("aria-expanded", "false");
      await page.reload();
      await expect(desktopSidebar).toHaveAttribute("aria-expanded", "false");
    }
  }

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
