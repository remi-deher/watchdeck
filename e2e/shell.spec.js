import { expect, test } from "@playwright/test";

/**
 * Comportement du shell commun, aux quatre profils configures.
 *
 * Ce fichier remplace les specs qui verifiaient la presence de chaines dans les
 * fichiers SCSS. Elles passaient au vert sans rien prouver du rendu : un selecteur
 * present mais annule plus bas dans la cascade les satisfaisait tout autant. On
 * mesure donc ici des proprietes observables dans le navigateur -- ce qui distingue
 * reellement une mise en page correcte d'une cassee.
 */

const SHELL_MEDIUM = 768;

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/session") {
      await route.fulfill({ json: { role: "admin", is_owner: true } });
      return;
    }
    if (pathname === "/api/users") {
      await route.fulfill({ json: [] });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

function isCompact(page) {
  return page.viewportSize().width < SHELL_MEDIUM;
}

/** Vrai si la page entiere deborde horizontalement. */
function pageOverflows(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto("/dashboard");
});

test("une seule navigation primaire est montee, selon la largeur", async ({ page }) => {
  const rail = page.locator(".app-rail");
  const dock = page.locator(".app-dock");

  if (isCompact(page)) {
    await expect(dock).toBeVisible();
    // Le rail ne doit pas etre simplement masque : monter les deux dupliquerait
    // l'ordre de tabulation et les reperes ARIA de la navigation principale.
    await expect(rail).toHaveCount(0);
  } else {
    await expect(rail).toBeVisible();
    await expect(dock).toHaveCount(0);
  }
});

test("la navigation primaire ne change pas de forme en changeant de domaine", async ({ page }) => {
  const primary = isCompact(page) ? ".app-dock" : ".app-rail";
  const other = isCompact(page) ? ".app-rail" : ".app-dock";

  // C'est l'invariant central de la refonte : les reperes de premier niveau restent
  // identiques d'un metier a l'autre. Le shell precedent remplacait la rangee
  // principale par des raccourcis contextuels dans Explorer et Bibliotheque.
  for (const path of ["/dashboard", "/discover", "/library", "/downloads", "/settings"]) {
    await page.goto(path);
    await expect(page.locator(primary)).toBeVisible();
    await expect(page.locator(other)).toHaveCount(0);
  }
});

test("chaque page expose un h1 unique, et son titre reste visible dans le shell", async ({ page }) => {
  for (const path of ["/dashboard", "/discover", "/library", "/downloads", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("#main-content")).toBeVisible();
    // Sans h1 unique, la navigation par en-tetes d'un lecteur d'ecran n'a pas de
    // point d'entree : c'etait le cas de toutes les vues passees a PageSearchHeader.
    const heading = page.locator("h1");
    await expect(heading, `h1 manquant ou duplique sur ${path}`).toHaveCount(1);

    // Le h1 ne s'affiche plus : c'est la barre de contexte qui porte le titre, et
    // elle ne defile jamais. Les deux doivent donc dire la meme chose, sans quoi le
    // titre annonce a l'oral differerait de celui qu'on lit a l'ecran.
    const title = (await heading.textContent()).trim();
    expect(title.length, `titre vide sur ${path}`).toBeGreaterThan(0);
    const visibleTitle = page.viewportSize().width >= 1200
      ? page.locator('.app-rail__brand-name')
      : page.locator('.app-topbar__context');
    await expect(visibleTitle, `le shell doit afficher "${title}" sur ${path}`).toHaveText(title);
  }
});

test("aucune page principale ne deborde horizontalement", async ({ page }) => {
  for (const path of ["/dashboard", "/discover", "/library", "/downloads", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("#main-content")).toBeVisible();
    expect(await pageOverflows(page), `debordement horizontal sur ${path}`).toBe(false);
  }
});

test("le skip-link mene au contenu et lui donne le focus", async ({ page }, testInfo) => {
  const skipLink = page.locator(".skip-link");

  // Safari ne place pas les liens dans l'ordre de tabulation par defaut : on n'y
  // verifie donc que la cible du lien, pas le chemin pour l'atteindre.
  if (testInfo.project.name !== "ios") {
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
  } else {
    await skipLink.focus();
  }

  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("toute destination est atteignable au clavier seul", async ({ page }) => {
  if (isCompact(page)) {
    // En mode compact, la totalite des destinations vit derriere la feuille : c'est
    // le seul chemin, il doit donc s'ouvrir et se fermer entierement au clavier.
    const trigger = page.getByRole("button", { name: "Ouvrir la navigation" });
    await trigger.focus();
    await trigger.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Navigation" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Explorer" })).toBeVisible();
    // Sur le document : la feuille se detache pendant sa fermeture, et viser
    // l'element rendait l'appui perdant face a sa propre disparition.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    return;
  }

  const links = page.locator(".app-rail a[href]");
  await expect(links.first()).toBeVisible();

  // Chaque lien du rail doit pouvoir recevoir le focus et le rendre visible : un
  // element focalisable sans indicateur visible est inutilisable au clavier.
  const count = await links.count();
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    await link.focus();
    await expect(link).toBeFocused();
    const outlined = await link.evaluate((node) => {
      const style = window.getComputedStyle(node);
      return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    });
    expect(outlined, "le focus doit rester visible dans le rail").toBe(true);
  }
});

test("les cibles interactives du shell respectent le seuil tactile", async ({ page }, testInfo) => {
  // Le seuil de 44px vise le doigt : c'est aussi la condition que --touch-target
  // applique dans le CSS (@media pointer: coarse). Au pointeur fin, l'exiger
  // reviendrait a gonfler des controles que la souris atteint deja sans peine.
  const minimum = testInfo.project.use.hasTouch ? 44 : 32;
  const surface = isCompact(page) ? ".app-dock" : ".app-rail";
  const boxes = await page
    .locator(`${surface} a, ${surface} button, .app-topbar button`)
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0)
        .map((box) => ({ width: box.width, height: box.height })),
    );

  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(minimum);
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(minimum);
  }
});

test("le contenu n'est masque ni par la barre de contexte ni par le dock", async ({ page }) => {
  await page.goto("/discover");
  const main = page.locator("#main-content");
  await expect(main).toBeVisible();

  const topbar = await page.locator(".app-topbar").boundingBox();
  const firstChild = await main.locator(":scope > *").first().boundingBox();
  expect(firstChild.y, "le contenu passe sous la barre de contexte").toBeGreaterThanOrEqual(
    topbar.y + topbar.height - 1,
  );

  if (isCompact(page)) {
    // Le dock est fixe : sans reserve en bas, il recouvrirait la fin du contenu, et
    // rien dans la page ne le signalerait a l'utilisateur.
    const dock = await page.locator(".app-dock").boundingBox();
    const reserved = await main.evaluate(
      (node) => parseFloat(window.getComputedStyle(node).paddingBottom),
    );
    expect(reserved).toBeGreaterThanOrEqual(dock.height - 1);
  }
});

test("le rail se replie et se deploie, et le choix survit au rechargement", async ({ page }) => {
  test.skip(page.viewportSize().width < 1200, "le repli n'existe qu'en mode deploye");

  const rail = page.locator(".app-rail");
  const expanded = (await rail.boundingBox()).width;

  await page.getByRole("button", { name: "Replier la navigation" }).click();
  const collapsed = (await rail.boundingBox()).width;
  expect(collapsed).toBeLessThan(expanded);

  // Le libelle doit disparaitre avec la largeur, sinon il deborde de la colonne.
  await expect(rail.locator(".app-rail__label").first()).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "Déployer la navigation" })).toBeVisible();
  expect((await rail.boundingBox()).width).toBeCloseTo(collapsed, 0);
});

test("la sous-navigation d'une page repond aux fleches", async ({ page }) => {
  await page.goto("/activity");
  // La rangee de sections, pas le premier tablist venu : la page porte aussi un
  // controle segmente de periode, qui expose le meme role.
  const tablist = page.locator('.app-subnav [role="tablist"]').first();
  await expect(tablist).toBeVisible({ timeout: 15_000 });

  const selected = tablist.locator('[role="tab"][aria-selected="true"]');
  const before = await selected.textContent();
  await selected.focus();
  await tablist.press("ArrowRight");

  const after = await tablist.locator('[role="tab"][aria-selected="true"]').textContent();
  expect(after).not.toBe(before);
  // Le focus suit la selection : sinon les fleches suivantes repartiraient de
  // l'ancien onglet et l'utilisateur perdrait le fil.
  await expect(tablist.locator('[role="tab"][aria-selected="true"]')).toBeFocused();
});

test("le selecteur de periode de l'activite change bien de valeur", async ({ page }) => {
  await page.goto("/activity?view=stats");
  await page.getByRole("button", { name: "Afficher les filtres" }).click();
  const segmented = page.locator('.ui-segmented-control, [class*="segmented"]').first();
  await expect(segmented).toBeVisible({ timeout: 15000 });
  const options = segmented.locator("button");
  const count = await options.count();
  expect(count).toBeGreaterThan(1);

  const activeBefore = await segmented.locator('[aria-pressed="true"], button.active').first().textContent();
  // On clique une option differente de celle en cours.
  for (let i = 0; i < count; i += 1) {
    const label = await options.nth(i).textContent();
    if (label !== activeBefore) { await options.nth(i).click(); break; }
  }
  await page.waitForTimeout(400);
  const activeAfter = await segmented.locator('[aria-pressed="true"], button.active').first().textContent();
  expect(activeAfter).not.toBe(activeBefore);
});

test("la recherche est centree sur le contenu et occupe la barre", async ({ page }) => {
  test.skip(isCompact(page), "sur mobile la recherche se déploie à la demande");
  await page.goto("/discover");

  const field = page.locator(".app-topbar__field");
  const main = page.locator("#main-content");
  await expect(field).toBeVisible();
  const [fieldBox, mainBox] = await Promise.all([field.boundingBox(), main.boundingBox()]);

  expect(Math.abs((fieldBox.x + fieldBox.width / 2) - (mainBox.x + mainBox.width / 2))).toBeLessThan(2);
  expect(fieldBox.width).toBeGreaterThanOrEqual(page.viewportSize().width >= 1200 ? 700 : 400);
});

test("les demandes n'exposent qu'un seul bouton de filtres", async ({ page }) => {
  await page.goto("/discover/requests");
  const filterButtons = page.getByRole("button", { name: /filtres/i });
  await expect(filterButtons).toHaveCount(1);
  await expect(filterButtons).toBeVisible();
});

test("la vue d'ensemble des parametres ouvre bien une section", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator("main a, main button").filter({ hasText: /Configurer/i }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  await page.waitForTimeout(500);
  // Ouvrir une section depuis la vue d'ensemble doit changer l'onglet dans l'URL.
  expect(page.url()).toMatch(/[?&]tab=/);
});

test("le niveau 2 reste accessible pendant le defilement", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    return route.fulfill({ json: {} });
  });
  // Fenetre courte : le contenu deborde a coup sur, donc la page defile reellement.
  // Sans defilement, un `position: sticky` ne se distingue pas d'un element statique
  // et le test passerait sans rien prouver. Largeur sous le seuil `expanded` : c'est
  // la que les sections vivent dans la page, donc la qu'il faut verifier qu'elles
  // restent visibles au defilement.
  await page.setViewportSize({ width: 1100, height: 480 });
  await page.goto("/downloads");
  const sticky = page.locator(".app-page__sticky");
  await expect(sticky).toBeVisible();
  await expect(sticky.locator(".app-subnav")).toBeVisible();

  const scrollable = await page.evaluate(() => {
    window.scrollTo(0, 1200);
    return document.documentElement.scrollHeight > window.innerHeight;
  });
  expect(scrollable, "la page doit defiler pour que le test ait un sens").toBe(true);
  await page.waitForTimeout(500);

  const box = await sticky.boundingBox();
  expect(Math.round(box.y)).toBeCloseTo(48, 0);
  await expect(sticky.locator(".app-subnav")).toBeVisible();
  await expect(sticky).toHaveClass(/is-stuck/);
});

test("la palette trouve un film depuis n'importe quelle page", async ({ page }) => {
  let searchCalls = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/session") {
      return route.fulfill({ json: { role: "admin", is_owner: true } });
    }
    if (url.pathname === "/api/discover/search") {
      searchCalls += 1;
      expect(url.searchParams.get("query")).toBe("dune");
      return route.fulfill({
        json: [
          { id: 438631, tmdb_id: 438631, media_type: "movie", title: "Dune", year: 2021 },
          { id: 693134, tmdb_id: 693134, media_type: "movie", title: "Dune, deuxième partie", year: 2024 },
        ],
      });
    }
    return route.fulfill({ json: [] });
  });

  // Depuis les reglages : aucune recherche de media n'y existe, c'est tout l'interet.
  await page.goto("/settings");
  await expect(page.locator("#main-content")).toBeVisible();

  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: /Aller à/ });
  await expect(palette).toBeVisible();

  await palette.getByRole("combobox").fill("dune");

  // Ouverte depuis les reglages, la palette propose d'abord la navigation et les
  // reglages : c'est l'intention la plus probable a cet endroit. Les medias sont a
  // une touche, dans l'autre onglet.
  const tabs = palette.getByRole("tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await tabs.nth(0).click();

  const option = palette.getByRole("option", { name: /Dune \(2021\)/ });
  await expect(option).toBeVisible({ timeout: 10000 });
  expect(searchCalls, "la recherche doit etre differee, pas lancee a chaque frappe").toBeLessThanOrEqual(2);

  await option.click();
  // La palette passe par mediaDetailPath, le meme assistant que la grille Explorer :
  // un media deja suivi mene ainsi a sa fiche bibliotheque ou a sa demande, et non a
  // une fiche de decouverte qui ignorerait son etat.
  await expect(page).toHaveURL(/\/discover\/media\/discover\/438631\?media_type=movie/);
});

test("une saisie trop courte n'interroge pas le catalogue", async ({ page }) => {
  let searchCalls = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (url.pathname === "/api/discover/search") searchCalls += 1;
    return route.fulfill({ json: [] });
  });
  await page.goto("/settings");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: /Aller à/ });
  await palette.getByRole("combobox").fill("d");
  await page.waitForTimeout(700);
  // Une seule lettre remonterait le catalogue entier pour rien.
  expect(searchCalls).toBe(0);
  // Les destinations locales, elles, filtrent immediatement.
  await expect(palette.getByRole("option").first()).toBeVisible();
});

test("les sections changent de surface selon la largeur, sans jamais se dupliquer", async ({ page }, testInfo) => {
  // Ce test pilote lui-meme sa largeur : le rejouer sur les profils tactiles, qui
  // emulent un appareil, ne verifierait rien de plus et se heurterait a leur viewport.
  test.skip(testInfo.project.name !== "desktop", "test pilote par la largeur, pas par l'appareil");
  await page.goto("/downloads");
  const inRail = page.locator(".app-rail__subnav");
  const inPage = page.locator(".app-page__sticky .app-subnav");

  // Au-dela du seuil deploye, la barre de contexte les porte ; en dessous, la page.
  // Jamais les deux : une rangee affichee deux fois donne deux etats actifs a suivre.
  //
  // Les sections d'Acquisition sont reservees aux administrateurs : elles n'existent
  // qu'une fois la session revenue, d'ou le delai large sur cette premiere attente.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(inRail).toBeVisible({ timeout: 15000 });
  await expect(inPage).toHaveCount(0);

  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(inPage).toBeVisible();
  await expect(inRail).toHaveCount(0);

  // Le titre de la page ne doit jamais ceder la place aux sections : c'est le seul
  // endroit ou il s'affiche depuis que le bandeau de titre a quitte la page.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.app-rail__brand-name')).toBeVisible();
});

test("la recherche de page vit dans la barre, et s’y deploie en compact", async ({ page }) => {
  await page.goto("/library");
  await expect(page.locator("#main-content")).toBeVisible();

  // La barre ne rend le champ qu'une fois que la page le lui a fourni.
  const field = page.locator(".app-topbar__field");
  await expect(field).toHaveCount(1);

  // Un seul champ de recherche a l'ecran : c'etait tout l'objet du deplacement.
  await expect(page.locator(".app-page__sticky input[type=\"search\"]")).toHaveCount(0);

  if (!isCompact(page)) {
    await expect(field.locator("input")).toBeVisible();
    return;
  }

  // En compact, le titre et un champ de 341px ne tiennent pas ensemble dans 390px :
  // le champ se deploie a la demande, par-dessus le titre.
  const expanded = page.locator(".app-topbar__field.is-expanded");
  await expect(expanded).toHaveCount(0);
  await page.locator(".app-topbar__search-compact").click();
  await expect(expanded).toBeVisible();

  const input = expanded.locator("input");
  await input.pressSequentially("dun", { delay: 60 });
  // La requete fait partie de l'objet de recherche, recree a chaque frappe : surveiller
  // cet objet refermait le champ des la premiere lettre.
  await expect(expanded, "le champ ne doit pas se refermer pendant la saisie").toBeVisible();
  await expect(input).toHaveValue("dun");

  // Echap suppose un clavier et la croix native n'efface que la saisie : il faut un
  // retour atteignable au doigt.
  await page.locator('.app-topbar [aria-label="Fermer la recherche"]').click();
  await expect(expanded).toHaveCount(0);
});

test("la barre contextuelle est centrée et le raccourci barre oblique cible la page", async ({ page }) => {
  await page.goto("/library");
  await expect(page.locator(".app-topbar__field")).toHaveCount(1, { timeout: 15_000 });

  await page.keyboard.press("/");
  const input = page.locator('.app-topbar__field input[type="search"]');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-label', /Bibliothèque/);

  if (page.viewportSize().width >= 768) {
    const bar = await page.locator('.app-topbar').boundingBox();
    const main = await page.locator('#main-content').boundingBox();
    const barCenter = bar.x + bar.width / 2;
    const mainCenter = main.x + main.width / 2;
    expect(Math.abs(barCenter - mainCenter)).toBeLessThanOrEqual(2);
  }
});
