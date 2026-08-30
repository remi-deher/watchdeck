import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial", timeout: 60_000 });

function catalog(page, totalPages = 2) {
  const offset = (page - 1) * 2;
  return {
    items: [1, 2].map((value) => ({
      tmdb_id: offset + value,
      media_type: value % 2 ? "movie" : "show",
      title: `Média ${offset + value}`,
      year: 2026,
      vote: 7.5,
      poster_url: null,
      requested: false,
      available: false,
      in_library: false,
    })),
    page,
    total_pages: totalPages,
    total_results: totalPages * 2,
  };
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/session") {
      await route.fulfill({ json: { role: "admin", is_owner: true } });
    } else if (url.pathname === "/api/discover/genres") {
      await route.fulfill({ json: [{ id: 28, name: "Action" }] });
    } else if (url.pathname.startsWith("/api/discover/")) {
      const requestedPage = Number(url.searchParams.get("page") || 1);
      // La page 1 tient sur moins de 400px (rootMargin du sentinel infini) : sans ce
      // delai, le chargement de la page 2 est quasi instantane et rend l'etat
      // intermediaire ("2 cartes avant scroll") impossible a observer de facon fiable.
      if (requestedPage > 1) await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({ json: catalog(requestedPage) });
    } else {
      await route.fulfill({ json: {} });
    }
  });
  await page.goto("/discover/movies", { waitUntil: "domcontentloaded" });
});

test("charge progressivement le catalogue et conserve des liens accessibles", async ({ page }) => {
  await expect(page.locator(".discover-card").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".discover-poster-link").first()).toHaveAttribute("href", /\/media\/discover\/1/);
  const cardBox = await page.locator('.discover-card').first().boundingBox();
  const posterBox = await page.locator('.discover-card .poster-shell').first().boundingBox();
  expect(Math.abs(cardBox.width - posterBox.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(cardBox.height - posterBox.height)).toBeLessThanOrEqual(2);

  // Le sentinel (rootMargin 400px) declenche le chargement automatiquement des qu'il
  // est rendu — pas besoin de scroll manuel, et l'attendre serait racy puisqu'il est
  // retire du DOM des que la derniere page est chargee.
  await expect(page.locator(".discover-card")).toHaveCount(4);
  await expect(page.getByText("4 affichés / 4")).toBeVisible();
});

test("conserve le catalogue Films lors d'une recherche", async ({ page }) => {
  const searchRequest = page.waitForRequest(request => (
    request.url().includes("/api/discover/search")
    && request.url().includes("media_type=movie")
  ));
  await page.getByRole("searchbox", { name: "Rechercher un film" }).fill("Dune");
  await searchRequest;
});

test("affiche la navigation dédiée et replie les filtres", async ({ page }) => {
  // Une seule navigation (AppNav) rendue en rail ou en barre selon la largeur, et qui
  // porte les sections de l'espace courant -- ici celles de Découvrir.
  // .app-nav-items : la liste des sections, sans la marque ni le bouton ☰.
  const navigation = page.locator('.app-nav-items');
  await expect(navigation.getByRole("link", { name: "Accueil" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Séries" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Films" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Demandes" })).toBeVisible();
  const filters = page.viewportSize().width <= 900
    ? page.locator('.modal-panel')
    : page.locator('.filter-sidebar');
  await expect(filters).toBeHidden();
  await page.getByRole("button", { name: /filtres/i }).click();
  await expect(filters).toBeVisible();
  await filters.getByRole('button', { name: 'Populaires' }).click();
  const reset = filters.getByRole('button', { name: 'Réinitialiser' });
  await expect(reset).toBeVisible();
  const layoutFits = await filters.evaluate(element => element.scrollWidth <= element.clientWidth + 1);
  expect(layoutFits).toBe(true);

  // Refermer avant de naviguer : sous 900px les filtres sont une modale, qui rend
  // l'arriere-plan inert -- la navigation y est donc volontairement inatteignable.
  if (page.viewportSize().width <= 900) {
    await page.getByRole("button", { name: "Fermer" }).click();
  } else {
    await page.getByRole("button", { name: "Masquer les filtres" }).click();
  }
  await expect(filters).toBeHidden();

  await navigation.getByRole("link", { name: "Séries" }).click();
  await expect(page).toHaveURL(/\/discover\/shows$/);
  await expect(page.getByRole("searchbox", { name: "Rechercher une série" })).toBeVisible();
  await navigation.getByRole("link", { name: "Accueil" }).click();
  await expect(page).toHaveURL(/\/discover$/);
});

test("reste utilisable au clavier et sur mobile", async ({ page }, testInfo) => {
  const firstCard = page.locator(".discover-card").first();
  const firstLink = firstCard.locator(".discover-poster-link");
  await firstLink.focus();
  await expect(firstLink).toBeFocused();
  if (page.viewportSize().width <= 640) {
    await expect(firstCard.getByRole("button", { name: "Demander" })).toBeVisible();
  }
});

test("centre la recherche dans le contenu, sous un rail de largeur fixe", async ({ page }) => {
  const searchBox = await page.locator('.psh-search-wrap').boundingBox();
  const mainBox = await page.locator('#main-content').boundingBox();
  expect(Math.abs((searchBox.x + searchBox.width / 2) - (mainBox.x + mainBox.width / 2))).toBeLessThan(3);

  if (page.viewportSize().width > 640) {
    // Le rail a remplace la sidebar repliable : deja reduit a une colonne d'icones, il
    // n'a plus de bascule ni d'etat a memoriser. Sa largeur ne bouge donc pas d'un
    // chargement a l'autre, et le contenu garde la meme origine.
    const rail = page.locator('.app-nav--rail');
    await expect(rail).toBeVisible();
    expect(await page.getByRole('button', { name: /Réduire le menu|Afficher le menu/ }).count()).toBe(0);

    const widthBefore = (await rail.boundingBox()).width;
    await page.reload();
    await expect(rail).toBeVisible();
    expect((await rail.boundingBox()).width).toBe(widthBefore);
    expect((await page.locator('#main-content').boundingBox()).x).toBe(mainBox.x);
  }
});
