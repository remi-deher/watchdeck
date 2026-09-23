import { expect, test } from "@playwright/test";

/**
 * Virtualisation de la grille de la mediatheque (useWindowVirtualGrid).
 *
 * Au-dela de 300 medias, seules les lignes proches de l'ecran sont rendues. Ce test
 * verrouille ce qui distingue une virtualisation correcte d'une cassee : le DOM reste
 * borne, le dernier media reste atteignable, les pages suivantes ne se chargent pas
 * toutes d'un coup (un declencheur place trop tot resterait visible et aspirerait tout
 * le catalogue), et une affiche ne change pas de place quand les lignes au-dessus
 * d'elle sont retirees du DOM.
 */

const PAGE = 200;
// Pas un multiple de PAGE : une derniere page pleine obligerait l'application a demander
// la suivante, vide, pour savoir qu'elle est au bout -- requete legitime, mais parasite ici.
const TOTAL = 1150;

function item(id) {
  return {
    id, title: `Film virtuel ${id}`, year: 2000 + (id % 26), media_type: "movie",
    poster_url: `/poster/${id}.svg`, genres: [], has_vf: true,
  };
}

async function mockLibrary(page, requested) {
  await page.route("**/poster/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>' }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (url.pathname === "/api/library") {
      const offset = Number(url.searchParams.get("offset") || 0);
      requested.push(offset);
      const rows = Array.from({ length: Math.max(0, Math.min(PAGE, TOTAL - offset)) }, (_, i) => item(offset + i + 1));
      return route.fulfill({ json: rows });
    }
    if (url.pathname === "/api/requests-list") return route.fulfill({ json: { items: [], facets: {} } });
    // La mediatheque attend une LISTE d'orphelins *arr : `{}` la faisait echouer.
    if (url.pathname === "/api/requests/orphans") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
}

const cardCount = (page) => page.locator(".media-grid > .poster-card").count();
const titles = (page) => page.locator(".media-grid > .poster-card").allInnerTexts();

test("la grille reste bornee et le catalogue entier reste atteignable", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "mesure de mise en page, une largeur suffit");
  test.setTimeout(120_000);
  const requested = [];
  await mockLibrary(page, requested);
  // Une recherche sort du hub et affiche la grille paginee.
  await page.goto("/library?type=movie&query=Film");
  await expect(page.locator(".media-grid > .poster-card").first()).toBeVisible({ timeout: 15000 });

  // Charger toutes les pages en descendant : chacune ne part qu'en bas de liste.
  for (let round = 0; round < 12 && requested.length < TOTAL / PAGE; round += 1) {
    const before = requested.length;
    // Redescendre a chaque tentative : la hauteur lue juste apres l'arrivee d'une page
    // peut preceder son rendu, et le « bas » vise n'etait alors plus le bas.
    await expect.poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      return requested.length;
    }, { timeout: 20000, intervals: [250, 500, 1000] }).toBeGreaterThan(before);
    await page.waitForTimeout(400);
    // Pas d'aspiration. Le declencheur de chargement anticipe de 400 px : quand le rendu
    // prend du retard (machine chargee), il peut enchainer UNE page de plus -- c'etait
    // deja le cas sans virtualisation. Au-dela, la grille aspirerait le catalogue.
    expect(requested.length - before, "une descente ne doit pas aspirer le catalogue").toBeLessThanOrEqual(2);
  }
  expect(requested).toEqual([0, 200, 400, 600, 800, 1000]);

  // Hauteur coherente : les intercalaires remplacent des lignes, ils ne doivent jamais
  // les exceder. Un pas de ligne mal mesure les faisait enfler jusqu'a 1,4 million de
  // pixels pour 400 medias. 2 colonnes au minimum, moins de 600 px par ligne.
  const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(documentHeight, "les intercalaires ne doivent pas enfler").toBeLessThan((TOTAL / 2) * 600);

  // DOM borne : bien moins que les 1 150 medias charges.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const rendered = await cardCount(page);
  expect(rendered).toBeGreaterThan(0);
  expect(rendered, "la grille doit etre virtualisee").toBeLessThan(300);

  // Le dernier media est atteignable.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByText(`Film virtuel ${TOTAL}`, { exact: false })).toBeVisible({ timeout: 5000 });
});

test("une affiche garde sa place quand les lignes au-dessus sortent du DOM", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  test.setTimeout(120_000);
  const requested = [];
  await mockLibrary(page, requested);
  await page.goto("/library?type=movie&query=Film");
  await expect(page.locator(".media-grid > .poster-card").first()).toBeVisible({ timeout: 15000 });
  // Deux pages : 400 medias, au-dela du seuil de virtualisation.
  await expect.poll(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    return requested.length;
  }, { timeout: 20000, intervals: [250, 500, 1000] }).toBe(2);

  const target = "Film virtuel 150";
  const positionOf = () => page.evaluate((name) => {
    const card = [...document.querySelectorAll(".media-grid > .poster-card")].find((el) => el.innerText.includes(name) && !el.innerText.includes(`${name}0`));
    return card ? Math.round(card.getBoundingClientRect().top + window.scrollY) : null;
  }, target);

  // La carte n'est dans le DOM que pres de l'ecran : on descend par paliers jusqu'a elle.
  await page.evaluate(() => window.scrollTo(0, 0));
  let reference = null;
  for (let y = 0; y < 60_000 && reference === null; y += 400) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(80);
    reference = await positionOf();
  }
  expect(reference).not.toBeNull();

  // Monter tout en haut puis revenir : les lignes au-dessus ont ete retirees puis
  // remises, l'affiche doit retomber exactement au meme endroit.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.evaluate((y) => window.scrollTo(0, y - 200), reference);
  await page.waitForTimeout(400);
  expect(await positionOf()).toBe(reference);
  expect(await titles(page)).not.toContain("Film virtuel 1\n");
});

test("ouvrir une fiche depuis une grille virtualisee puis revenir retrouve la carte", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  test.setTimeout(120_000);
  const requested = [];
  await mockLibrary(page, requested);
  await page.goto("/library?type=movie&query=Film");
  await expect(page.locator(".media-grid > .poster-card").first()).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    return requested.length;
  }, { timeout: 20000, intervals: [250, 500, 1000] }).toBe(2);

  // Une carte de la premiere page, ouverte alors que 400 medias sont charges (grille
  // virtualisee). NB : au retour, la mediatheque est remontee avec sa seule premiere
  // page -- c'est anterieur a la virtualisation --, d'ou une carte de cette page-la.
  const target = "Film virtuel 120";
  let card = null;
  for (let y = 0; y < 80_000 && !card; y += 400) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(60);
    card = await page.$(`.media-grid > .poster-card:has-text("${target}")`);
  }
  expect(card, "la carte visee doit etre rendue pres de l'ecran").not.toBeNull();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  // Position de la carte dans le DOCUMENT, et non `scrollY` : avant de cliquer, Playwright
  // fait lui-meme defiler l'element pour le rendre cliquable, ce qui deplace la fenetre
  // d'une fraction de ligne -- et c'est cette position-la que le routeur restaure.
  const documentTop = () => page.evaluate((name) => {
    const el = [...document.querySelectorAll('.media-grid > .poster-card')].find((c) => c.innerText.includes(name));
    return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
  }, target);
  const before = await documentTop();
  expect(before).not.toBeNull();

  await card.click();
  await expect(page).toHaveURL(/\/media\//, { timeout: 10000 });
  await page.goBack();
  await expect(page).toHaveURL(/\/library/);
  await page.waitForTimeout(1500);

  // Au retour, la carte est retrouvee a sa place dans le document, et a l'ecran : ni
  // intercalaire mal dimensionne, ni lignes du haut rendues sous un ecran positionne plus bas.
  const after = await documentTop();
  expect(after, "la carte doit etre rendue au retour").not.toBeNull();
  expect(Math.abs(after - before)).toBeLessThan(8);
  await expect(page.locator(`.media-grid > .poster-card:has-text("${target}")`)).toBeInViewport();
});
