import { expect, test } from "@playwright/test";

/**
 * La rangee de sections (AppSubnav) et la barre de recherche flottent l'une sous l'autre.
 * Quand la barre se masque au defilement vers le bas puis revient en remontant, la rangee
 * reprend sa place normale -- a la meme distance de la barre qu'en haut de page -- au lieu
 * de se coller contre elle. Masquee, elle monte toujours prendre la place de la barre.
 * Sur telephone la barre est en bas : la question ne se pose pas.
 */

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    await route.fulfill({ json: { "/api/session": { role: "admin", is_owner: true }, "/api/settings": { notify_on_request: true, email_enabled: true } }[p] ?? {} });
  });
}

const measure = (page) => page.evaluate(() => {
  const capsule = document.querySelector(".app-topbar__field .ui-search-field").getBoundingClientRect();
  const row = document.querySelector(".app-page__sticky").getBoundingClientRect();
  const nav = document.querySelector(".app-page__sticky .app-subnav").getBoundingClientRect();
  return {
    gap: Math.round(nav.top - capsule.bottom),
    rowTop: Math.round(row.top),
    hidden: document.querySelector(".app-topbar").classList.contains("is-hidden"),
  };
});
const scrollTo = async (page, y) => {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(700);
};

test("la rangee de sections reprend sa place normale quand la barre reapparait", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile" || testInfo.project.name === "ios", "la barre est en bas sur telephone");
  await mockApi(page);
  await page.goto("/settings/notifications/rules");
  await expect(page.locator(".app-page__sticky .app-subnav")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);

  const rest = await measure(page);
  expect(rest.hidden).toBe(false);

  // Vers le bas : la barre part, la rangee monte prendre sa place (comportement inchange).
  await scrollTo(page, 600);
  const down = await measure(page);
  expect(down.hidden, "la barre devrait etre masquee").toBe(true);
  expect(down.rowTop, "masquee, la rangee monte en haut de l'ecran").toBeLessThanOrEqual(1);

  // Vers le haut : la barre revient, la rangee garde l'ecart normal (elle ne la touche pas).
  await scrollTo(page, 520);
  const up = await measure(page);
  expect(up.hidden, "la barre devrait etre revenue").toBe(false);
  expect(up.gap, "la rangee colle la barre de recherche").toBeGreaterThan(8);
  expect(Math.abs(up.gap - rest.gap), `ecart ${up.gap}px au lieu de ${rest.gap}px en haut de page`).toBeLessThanOrEqual(2);
});
