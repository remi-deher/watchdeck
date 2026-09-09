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
    // En compact le titre a quitte la barre : il ne servait qu'a rogner la largeur du
    // champ de recherche, et le dock du bas indique deja la destination courante. Au-dela,
    // le shell continue de l'afficher.
    if (page.viewportSize().width >= 768) {
      const visibleTitle = page.viewportSize().width >= 1200
        ? page.locator('.app-rail__brand-name')
        : page.locator('.app-topbar__context');
      await expect(visibleTitle, `le shell doit afficher "${title}" sur ${path}`).toHaveText(title);
    }
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
    // Le bouton de la barre du haut a disparu : « Plus », dans le dock, ouvre la meme
    // feuille et libere la largeur de la barre pour la recherche.
    const trigger = page.locator(".app-dock button").filter({ hasText: "Plus" });
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
  // Les sections de l'Activite sont devenues celles de sa destination, donc des liens
  // de navigation et non des onglets : les fleches n'ont pas de sens sur un `<nav>`.
  // Le comportement teste ici reste celui de la variante `tabs`, toujours utilisee par
  // les journaux, l'Acquisition, les ameliorations VF et la fiche media.
  await page.goto("/logs");
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
  // La periode n'est plus enfermee derriere le bouton « Filtres » : ce n'en etait pas
  // un, et le tiroir n'avait plus qu'une seule entree. Elle partage desormais la rangee
  // collante des sections, ou la barre du haut en mode deploye -- dans les deux cas
  // visible sans ouvrir quoi que ce soit.
  await page.goto("/activity");
  const segmented = page.getByRole("tablist", { name: /Période/ }).first();
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

test("changer le tri de l'historique redemande la periode entiere", async ({ page }) => {
  // Le tri vivait dans le navigateur, sur les cent lignes deja chargees : « Anciennes »
  // retournait la premiere page au lieu d'aller chercher les plus anciennes lectures,
  // et le changement ne declenchait aucune requete.
  const sorts = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/playback/history") sorts.push(url.searchParams.get("sort"));
  });

  await page.goto("/activity?view=history");
  const segmented = page.getByRole("tablist", { name: /Trier/ }).first();
  await expect(segmented).toBeVisible({ timeout: 15000 });
  await segmented.getByRole("tab", { name: "Anciennes" }).click();

  await expect.poll(() => sorts.at(-1), { timeout: 10000 }).toBe("oldest");
});

test("le tiroir d'une session occupe toute la hauteur, sans barre de defilement", async ({ page }) => {
  test.skip(isCompact(page), "en compact le tiroir est une feuille ancree en bas");
  // L'historique du serveur de test est vide : on fournit une lecture, seul moyen
  // d'ouvrir le tiroir.
  await page.route("**/api/playback/history**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 1,
            source: "plex",
            session_id: "s1",
            title: "Le Voyage de Chihiro",
            user_name: "Lisa",
            media_type: "movie",
            playback_method: "direct_play",
            watched_ms: 3_600_000,
            duration_ms: 7_200_000,
            started_at: "2026-01-01T20:00:00",
            ended_at: "2026-01-01T21:00:00",
            segments: [],
          },
        ],
        total: 1,
        has_more: false,
        facets: { users: ["Lisa"], devices: [] },
      },
    }),
  );
  await page.goto("/activity?view=history");
  const row = page.locator(".history-table button").first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.click();

  const drawer = page.locator(".detail-drawer");
  await expect(drawer).toBeVisible();
  const metrics = await drawer.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      top: box.top,
      bottomGap: window.innerHeight - box.bottom,
      // La difference entre largeur de bordure a bordure et largeur utile revient a la
      // barre de defilement : masquee, elle ne prend plus rien.
      scrollbar: node.offsetWidth - node.clientWidth - 2,
      scrollable: node.scrollHeight > node.clientHeight,
    };
  });

  // La feuille part du haut de la fenetre : elle passe devant la barre flottante au lieu
  // de lui ceder sa hauteur.
  expect(metrics.top).toBeLessThanOrEqual(12);
  expect(metrics.bottomGap).toBeLessThanOrEqual(12);
  expect(metrics.scrollbar).toBeLessThanOrEqual(0);
  // Masquer la barre ne doit pas empecher de lire la suite.
  if (metrics.scrollable) {
    const moved = await drawer.evaluate((node) => {
      node.scrollTop = 200;
      return node.scrollTop;
    });
    expect(moved).toBeGreaterThan(0);
  }
});

test("l'historique charge la suite au defilement", async ({ page }) => {
  // Le seul moyen de descendre dans plusieurs milliers de lignes etait de cliquer
  // « Afficher 100 de plus » a chaque page.
  const row = (id) => ({
    id,
    source: "plex",
    session_id: `s${id}`,
    title: `Film ${id}`,
    user_name: id % 2 ? "Lisa" : "Rémi",
    media_type: "movie",
    playback_method: "direct_play",
    watched_ms: 3_600_000,
    started_at: `2026-01-0${(id % 3) + 1}T20:00:00`,
    ended_at: `2026-01-0${(id % 3) + 1}T21:00:00`,
    segments: [],
  });
  await page.route("**/api/playback/history**", (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
    route.fulfill({
      json: {
        items: Array.from({ length: 30 }, (_, index) => row(offset + index + 1)),
        total: 60,
        has_more: offset === 0,
        facets: { users: [], devices: [] },
      },
    });
  });

  await page.goto("/activity?view=history");
  const rows = page.locator(".history-table button");
  await expect(rows).toHaveCount(30, { timeout: 15000 });

  // On descend : la sentinelle placee sous la liste doit declencher la page suivante.
  await page.locator(".history-sentinel").scrollIntoViewIfNeeded();

  await expect(rows).toHaveCount(60, { timeout: 10000 });
  // Et l'historique se lit par date : chaque journee porte son en-tete.
  await expect(page.locator(".history-day").first()).toBeVisible();
});

test("une confirmation ouverte depuis un tiroir reste cliquable", async ({ page }) => {
  // Le tiroir et la modale partageaient le meme z-index : seul l'ordre du DOM les
  // departageait, et la modale -- montee avec sa page, donc teleportee avant le tiroir
  // ouvert plus tard -- passait dessous. Le bouton « Fusionner » ouvrait bien la
  // confirmation, mais aucun clic ne l'atteignait.
  const user = (id, name) => ({
    id,
    plex_user_id: name.toLowerCase(),
    username: name,
    display_name: name,
    friendly_name: name,
    enabled: true,
    role: "user",
    seer_user_id: null,
  });
  await page.route("**/api/users**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") return route.continue();
    // La fiche d'un utilisateur et la liste passent par la meme racine d'URL.
    const match = url.pathname.match(/\/api\/users\/(\d+)$/);
    if (match) return route.fulfill({ json: user(Number(match[1]), match[1] === "1" ? "Alice" : "Bob") });
    if (url.pathname !== "/api/users") return route.fulfill({ json: [] });
    route.fulfill({ json: [user(1, "Alice"), user(2, "Bob")] });
  });
  await page.goto("/users");

  const row = page.getByRole("button", { name: /Alice/ }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.click();

  const drawer = page.locator(".detail-drawer");
  await expect(drawer).toBeVisible();
  await drawer.getByText("Seer", { exact: true }).click();
  await drawer.locator("select").selectOption({ label: "Bob" });
  await drawer.getByRole("button", { name: "Fusionner" }).click();

  // La confirmation doit etre au premier plan : c'est elle qui doit recevoir le clic.
  const modal = page.locator(".modal-panel");
  await expect(modal).toBeVisible();
  const reachable = await modal.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return node.contains(top);
  });
  expect(reachable, "la confirmation est recouverte par le tiroir").toBe(true);
});

test("la recherche garde le focus quand la page change d'URL sous le doigt", async ({ page }, testInfo) => {
  // Taper la premiere lettre dans Decouvrir fait passer /discover a /discover/explore.
  // Deux mecanismes arrachaient alors le champ : la barre se refermait au changement de
  // titre, et la navigation deplacait le focus vers le contenu pour l'annoncer.
  await page.goto("/discover");
  // Le deploiement du champ en compact a son propre test ; ici on veut seulement
  // verifier que la frappe survit au changement d'URL, ce qui ne depend pas de la taille.
  test.skip(isCompact(page), "le champ se deploie a la demande en compact");
  const field = page.locator(".app-topbar__field input").first();
  await expect(field).toBeVisible({ timeout: 15000 });
  await field.click();

  await field.pressSequentially("bat", { delay: 120 });

  await expect(page).toHaveURL(/\/discover\/explore/);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("bat");
});

test("une vraie navigation donne toujours le focus au contenu", async ({ page }) => {
  // Le garde-fou ne doit pas supprimer l'annonce de page : hors saisie, le focus va au
  // contenu principal, ce qui permet aux lecteurs d'ecran de suivre.
  await page.goto("/discover");
  await page.locator("#main-content").waitFor();

  await page.goto("/logs");
  await page.waitForURL(/\/logs/);

  const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  expect(["main-content", "BODY"]).toContain(focused);
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
  // Le champ est desormais visible d'emblee en compact : plus de loupe a taper d'abord.
  await expect(page.locator(".app-topbar").getByRole("searchbox", { name: /demande/i })).toBeVisible();
  await expect(page.locator("#main-content").getByRole("searchbox")).toHaveCount(0);
});

test("la vue d'ensemble des parametres ouvre bien une section", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator("main a, main button").filter({ hasText: /Configurer/i }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  await page.waitForTimeout(500);
  // Chaque section des reglages a desormais son chemin propre : les groupes sont
  // devenus des destinations du rail, et `?tab=` n'est plus qu'une redirection.
  expect(new URL(page.url()).pathname).toMatch(/^\/settings\/.+/);
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
  const expectedTop = await sticky.evaluate((node) => parseFloat(window.getComputedStyle(node).top));
  expect(Math.round(box.y)).toBeCloseTo(Math.round(expectedTop), 0);
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

test("la recherche de page vit dans la barre, et occupe toute sa largeur en compact", async ({ page }) => {
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

  // En compact, la barre ne porte plus que la recherche : le bouton de navigation est
  // passe dans « Plus » (dock) et le titre a disparu, ce qui rend le champ visible
  // d'emblee au lieu de se deployer derriere une loupe.
  const input = field.locator("input");
  await expect(input).toBeVisible();
  await expect(page.locator('[aria-label="Ouvrir la navigation"]')).toHaveCount(0);
  await expect(page.locator(".app-topbar__context")).toHaveCount(0);

  // Le champ doit occuper l'essentiel de la barre : c'etait tout l'objet du menage.
  const [fieldBox, barBox] = await Promise.all([field.boundingBox(), page.locator(".app-topbar").boundingBox()]);
  expect(fieldBox.width / barBox.width).toBeGreaterThan(0.7);

  await input.pressSequentially("dun", { delay: 60 });
  // La requete fait partie de l'objet de recherche, recree a chaque frappe : surveiller
  // cet objet refermait le champ des la premiere lettre.
  await expect(input, "le champ ne doit pas disparaitre pendant la saisie").toBeVisible();
  await expect(input).toHaveValue("dun");
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
