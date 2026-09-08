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

/** Champ de recherche de la page, deplie d'abord si la largeur l'impose. */
async function pageSearchBox(page) {
  // La barre ne rend le champ qu'une fois que la page le lui a fourni : cliquer avant
  // ouvrirait la recherche globale a la place.
  const field = page.locator(".app-topbar__field");
  await expect(field).toHaveCount(1, { timeout: 15_000 });
  const compact = page.locator(".app-topbar__search-compact");
  if (await compact.isVisible()) await compact.click();
  const input = field.locator('input[type="search"]');
  await expect(input).toBeVisible();
  return input;
}

test("conserve le catalogue Films lors d'une recherche", async ({ page }) => {
  const searchRequest = page.waitForRequest(request => (
    request.url().includes("/api/discover/search")
    && request.url().includes("media_type=movie")
  ));
  await (await pageSearchBox(page)).fill("Dune");
  await searchRequest;
});

test("affiche la navigation dédiée et replie les filtres", async ({ page }) => {
  // Le second niveau vit desormais dans la page, sous son titre, au meme endroit
  // quelle que soit la largeur : plus de sous-menu survolable dans le shell, dont la
  // rangee principale changeait de contenu selon la section.
  const navigation = page.viewportSize().width >= 1200
    ? page.locator('.app-rail__subnav')
    : page.locator('.app-subnav');
  await expect(navigation.getByRole("link", { name: "Séries" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Films" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Accueil" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Calendrier" })).toBeVisible();
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
  // Changer de section met a jour le champ de la barre : la page suivante fournit sa
  // propre recherche, et le demontage de la precedente ne doit pas l'effacer.
  await expect(await pageSearchBox(page)).toHaveAttribute("aria-label", /Rechercher une série/);
  await navigation.getByRole("link", { name: "Films" }).click();
  await expect(page).toHaveURL(/\/discover\/movies$/);
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

test("place la recherche dans la barre, jamais dans le contenu", async ({ page }) => {
  // Un seul champ de recherche a l'ecran, et il vit dans la barre : elle ne defile
  // pas, et la page n'a plus a lui reserver une rangee.
  await expect(page.locator("#main-content input[type=\"search\"]")).toHaveCount(0);

  await expect(page.locator(".app-topbar__field")).toHaveCount(1, { timeout: 15_000 });
  const main = await page.locator("#main-content").boundingBox();
  const topbar = await page.locator(".app-topbar").boundingBox();

  // La barre est fixe : c'est le premier contenu de <main>, pas sa boite, qui doit
  // commencer sous elle — la boite, elle, part de zero et se decale par son padding.
  const firstChild = await page.locator("#main-content > *").first().boundingBox();
  expect(firstChild.y).toBeGreaterThanOrEqual(topbar.y + topbar.height - 1);

  // La geometrie du shell ne doit pas bouger d'un chargement a l'autre : c'est ce
  // saut au rechargement qui trahissait les offsets recopies a plusieurs endroits.
  await page.reload();
  await expect(page.locator("#main-content")).toBeVisible();
  expect((await page.locator("#main-content").boundingBox()).x).toBe(main.x);
});
