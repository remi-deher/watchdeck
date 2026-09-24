import { expect, test } from "@playwright/test";

/**
 * Un seul systeme de filtres dans toute l'application : groupes repliables, pastilles
 * (a deux ou trois etats) et, pour les listes longues, une liste avec recherche. Ces
 * tests le verifient la ou il remplace d'anciens composants propres a un ecran.
 */

const USERS = [
  { id: 1, custom_name: "Alice" },
  { id: 2, display_name: "Bruno" },
  { id: 3, plex_user_id: "chloe" },
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

/** Le panneau est une colonne sur grand ecran, une feuille sur telephone. */
async function openFilters(page, visibleTarget) {
  if (await visibleTarget.isVisible()) return;
  await page.getByRole("button", { name: "Afficher les filtres" }).first().click();
  await expect(visibleTarget).toBeVisible();
}

test("les torrents se filtrent aux pastilles, avec exclusion au second appui", async ({ page }) => {
  await mockApi(page);
  await page.goto("/downloads?view=clients&sub=instances");
  const table = page.locator(".torrent-table");
  await expect(table).toContainText("Alpha.2024.1080p");

  const films = page.getByRole("group", { name: "Catégorie" }).getByRole("button", { name: /^films/ });
  await openFilters(page, films);

  await films.click();
  await expect(table).not.toContainText("Bravo.S01");
  await expect(table).toContainText("Alpha.2024.1080p");

  await films.click();
  await expect(films).toHaveAccessibleName(/exclu/);
  await expect(table).not.toContainText("Alpha.2024.1080p");
  await expect(table).toContainText("Bravo.S01");

  await films.click();
  await expect(table).toContainText("Alpha.2024.1080p");
  await expect(table).toContainText("Bravo.S01");
});

test("les notifications se filtrent par utilisateur dans une liste avec recherche", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/notifications?tab=history");

  const input = page.getByRole("combobox", { name: "Utilisateur" });
  await openFilters(page, input);
  await input.click();
  await input.fill("bru");
  const listbox = page.getByRole("listbox");
  await expect(listbox.getByRole("option")).toHaveCount(1);
  await listbox.getByRole("option", { name: "Bruno" }).click();

  await expect.poll(() => calls.some((call) => call.startsWith("/api/notifications/log") && call.includes("users=2"))).toBe(true);
});

test("les groupes repliables annoncent leur etat et resument le choix", async ({ page }) => {
  await mockApi(page);
  await page.goto("/downloads?view=clients&sub=instances");
  await expect(page.locator(".torrent-table")).toContainText("Alpha.2024.1080p");
  const header = page.locator(".filter-group-header:visible", { hasText: "Statut" });
  await openFilters(page, header);
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
});

test("sur telephone, la feuille de filtres ouverte garde la barre de recherche a l'ecran", async ({ page }) => {
  test.skip(page.viewportSize().width > 900, "la feuille n'existe que sur petit ecran");
  await mockApi(page);
  const many = Array.from({ length: 60 }, (_, i) => ({ client_id: 7, client_name: "Maison", hash: `h${i}`, title: `Torrent ${i}`, status: "downloading", progress: 10, category: "films" }));
  await page.route("**/api/downloads/clients", (route) => route.fulfill({ json: many }));
  await page.goto("/downloads?view=clients&sub=instances");
  await page.locator(".torrent-table").getByText("Torrent 0", { exact: true }).waitFor();

  const bar = page.locator(".app-topbar");
  // Sans feuille, descendre masque bien la barre : le mecanisme fonctionne.
  const scrollThrough = (from, to) => page.evaluate(async ([a, b]) => {
    const step = a < b ? 150 : -150;
    for (let y = a; step > 0 ? y <= b : y >= b; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
  }, [from, to]);
  await scrollThrough(0, 900);
  await expect(bar).toHaveClass(/is-hidden/);
  await scrollThrough(900, 0);
  await expect(bar).not.toHaveClass(/is-hidden/);

  await page.getByRole("button", { name: "Afficher les filtres" }).first().click();
  await expect(page.locator(".filter-sheet")).toBeVisible();
  // La page defile derriere la feuille : la barre ne doit pas partir.
  await scrollThrough(0, 1200);
  await expect(bar).not.toHaveClass(/is-hidden/);
});
