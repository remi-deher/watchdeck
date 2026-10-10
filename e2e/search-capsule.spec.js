import { expect, test } from "@playwright/test";

/**
 * La capsule de recherche de la barre du haut : son segment de droite ne s'affiche que s'il
 * porte quelque chose, et l'action principale qu'il porte reste lisible.
 */

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    await route.fulfill({ json: { "/api/session": { role: "admin", is_owner: true }, "/api/settings": { notify_on_request: true, email_enabled: true } }[p] ?? {} });
  });
}

test("sans action ni outil, le segment de droite n'existe pas (ni son separateur)", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/notifications/reasons");
  await expect(page.locator(".ui-search-field")).toBeVisible();
  // La page doit etre chargee (ses reglages lus) pour que ses outils, vides, soient poses.
  await expect(page.getByRole("heading", { name: /Motifs|Notifications/ }).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  // Le segment peut rester dans le DOM, mais vide : il ne prend alors aucune place.
  const widths = await page.locator(".ui-search-field__action").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
  expect(widths.every((width) => width === 0), `un segment vide occupe de la place : ${widths}`).toBe(true);
});

test("l'action principale de la capsule est lisible (texte et fond distincts)", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/notifications/rules");
  const save = page.locator(".ui-search-field__action").getByRole("button", { name: /Enregistrer/ });
  await expect(save).toBeVisible();
  const { color, background } = await save.evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, background: style.backgroundColor };
  });
  // Texte blanc sur fond transparent : invisible sur la capsule claire.
  const transparent = /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(background);
  expect(!(transparent && color === "rgb(255, 255, 255)"), `texte ${color} sur fond ${background}`).toBe(true);
});
