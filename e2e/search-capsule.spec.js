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

/* Trois niveaux, tous a la couleur d'accent : repos, defilement, focus. */
const capsule = (page) => page.locator(".app-topbar .ui-search-field");
/* `color-mix` se lit `color(srgb 0.64 0.37 0 / 0.4)` : on ramene tout en canaux 0-255 + alpha. */
const edge = (page) => capsule(page).evaluate((node) => {
  const style = getComputedStyle(node);
  const raw = style.borderTopColor;
  const [colors, alphaPart] = raw.split("/");
  const numbers = (colors.match(/[\d.]+/g) || []).map(Number);
  const channels = raw.startsWith("color(") ? numbers.map((n) => Math.round(n * 255)) : numbers.slice(0, 3);
  const alpha = alphaPart ? Number(alphaPart.match(/[\d.]+/)[0]) : raw.startsWith("rgba") ? numbers[3] : 1;
  return { alpha, color: channels.join(","), shadow: style.boxShadow, blur: style.backdropFilter || style.webkitBackdropFilter, bg: style.backgroundColor };
});
const accent = (page) => page.evaluate(() => {
  const probe = document.createElement("i");
  probe.style.color = "var(--accent)";
  document.body.append(probe);
  const [r, g, b] = getComputedStyle(probe).color.match(/[\d.]+/g);
  probe.remove();
  return [r, g, b].join(",");
});

test("la capsule a trois niveaux : repos, defilement, focus", async ({ page }) => {
  await mockApi(page);
  await page.goto("/discover/requests");
  await expect(capsule(page)).toBeVisible();
  // La page remet son defilement a zero en finissant de charger : on attend qu'elle ait fini.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  // De la hauteur a parcourir : la page doit pouvoir defiler.
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "2400px";
    document.querySelector("#main-content")?.append(spacer);
  });
  const theme = await accent(page);

  // 1. Repos : un contour d'accent attenue, deja visible, avec un fond flou.
  const rest = await edge(page);
  expect(rest.color, "le contour est a la couleur d'accent du theme").toBe(theme);
  expect(rest.alpha).toBeGreaterThan(0.25);
  expect(rest.alpha).toBeLessThan(0.6);
  expect(rest.blur).toContain("blur");
  expect(rest.bg).not.toMatch(/rgb\(\d+, \d+, \d+\)$/);

  // 2. Defilement : contour plus marque et ombre plus forte.
  await page.evaluate(() => window.scrollTo(0, 80));
  // Le contour et l'ombre passent par une transition : on attend qu'elle ait fini.
  await expect.poll(async () => { const now = await edge(page); return now.color === theme && now.alpha > rest.alpha + 0.1; }, { message: "le contour se renforce au defilement" }).toBe(true);
  const scrolled = await edge(page);
  expect(scrolled.color).toBe(theme);
  expect(scrolled.shadow).not.toBe(rest.shadow);
  await expect(capsule(page)).toHaveClass(/is-elevated/);

  // 3. Focus : l'accent plein et son halo, par-dessus le niveau precedent.
  await capsule(page).locator("input").focus();
  await expect.poll(async () => { const now = await edge(page); return now.color === theme && now.alpha > 0.95; }, { message: "le focus prend l'accent plein" }).toBe(true);
  const focused = await edge(page);
  expect(focused.color).toBe(theme);
  expect(focused.shadow).toContain("0px 0px 0px 2px");

  // Retour en haut de page : le niveau de repos revient.
  await capsule(page).locator("input").blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(capsule(page)).not.toHaveClass(/is-elevated/);
  await expect.poll(async () => { const now = await edge(page); return now.color === theme && now.alpha < 0.6; }, { message: "le repos revient" }).toBe(true);
});
