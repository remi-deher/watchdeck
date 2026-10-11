import { expect, test } from "@playwright/test";

/**
 * L'en-tete de la fiche media (SheetHero) : le bas de l'affiche est la limite. Statut, dates et
 * boutons se glissent a droite de l'affiche, sous le texte, tant qu'ils tiennent sans la
 * depasser ; sinon ils restent dessous, en ligne. Ils suivent le texte en direct.
 */
const SHORT = "Un officier découvre un secret qui peut tout changer.";
const LONG = "En 2049, la société est fragilisée par les nombreuses tensions entre les humains et leurs esclaves créés par bioingénierie. L’officier K est un Blade Runner : il fait partie d’une force d’intervention d’élite chargée de trouver et d’éliminer ceux qui n’obéissent pas aux ordres des humains. Lorsqu’il découvre un secret enfoui depuis longtemps et capable de changer le monde, les plus hautes instances décident que c’est à son tour d’être traqué et éliminé. Son seul espoir est de retrouver Rick Deckard, un ancien Blade Runner qui a disparu depuis des décennies.";
const detail = (overview) => ({
  id: 1, title: "Blade Runner 2049", year: 2017, media_type: "movie", overview, poster_url: "/poster/1.svg", in_library: true, library_id: 1, has_vf: true,
  plex_guid: "plex://movie/abc", genres: [], media: {}, requests: [],
  release_dates: { cinema: "2017-10-04", plateforme: "2018-02-04", dvd_bluray: "2018-02-14" },
  availability: { plex: "present", episodes: { state: "unknown" }, languages: { has_vf: true } },
});

async function openSheet(page, overview) {
  await page.route("**/poster/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#7a2e8a"/></svg>' }));
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (p === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (p.startsWith("/api/media/detail")) return route.fulfill({ json: detail(overview) });
    return route.fulfill({ json: {} });
  });
  await page.goto("/library/media/library/1");
  await expect(page.locator(".mdh-info h1")).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}
const zones = (page) => page.evaluate(() => ({
  aside: [...document.querySelectorAll(".sheet-hero__aside .sheet-hero__dock-item > *")].map((node) => node.className.split(" ")[0]),
  below: [...document.querySelectorAll(".sheet-hero__dock .sheet-hero__dock-item > *")].map((node) => node.className.split(" ")[0]),
}));

test("texte court, grand écran : le statut, les dates et les boutons se glissent à droite de l'affiche", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "disposition large");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSheet(page, SHORT);
  await expect.poll(async () => (await zones(page)).aside.length, { message: "le dock se glisse à droite" }).toBeGreaterThan(0);
  const placed = await page.evaluate(() => {
    const poster = document.querySelector(".mdh-poster").getBoundingClientRect();
    const aside = document.querySelector(".sheet-hero__aside").getBoundingClientRect();
    const text = document.querySelector(".mdh-info").getBoundingClientRect();
    return { asideLeft: aside.left, posterRight: poster.right, asideBottom: aside.bottom, posterBottom: poster.bottom, textBottom: text.bottom };
  });
  expect(placed.asideLeft, "à droite de l'affiche").toBeGreaterThan(placed.posterRight);
  expect(placed.asideBottom, "sans dépasser le bas de l'affiche").toBeLessThanOrEqual(placed.posterBottom + 1);
});

test("résumé déplié : ce qui ne tient plus passe dessous, sur une ligne, puis revient une fois replié", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "disposition large");
  await page.setViewportSize({ width: 900, height: 1000 });
  await openSheet(page, LONG);
  const more = page.getByRole("button", { name: "Lire la suite" });
  await expect(more).toBeVisible();
  const before = await zones(page);

  await more.click();
  await expect.poll(async () => (await zones(page)).below.length, { message: "le texte déplié pousse le dock dessous" }).toBeGreaterThanOrEqual(before.below.length);
  const open = await zones(page);
  expect(open.aside, "plus rien à droite quand le texte dépasse l'affiche").toEqual([]);
  expect(open.below.length).toBeGreaterThan(0);
  // « En ligne » : les éléments du dock partagent une rangée, ils ne s'empilent pas en colonne.
  const band = await page.evaluate(() => {
    const rects = [...document.querySelectorAll(".sheet-hero__dock .sheet-hero__dock-item")].map((node) => node.getBoundingClientRect());
    return { highestBottom: Math.min(...rects.map((r) => r.bottom)), lowestTop: Math.max(...rects.map((r) => r.top)) };
  });
  expect(band.lowestTop, "tous les éléments occupent la même bande horizontale").toBeLessThan(band.highestBottom);

  await page.getByRole("button", { name: "Réduire" }).click();
  await expect.poll(async () => (await zones(page)).below.length, { message: "replié, des éléments reviennent à droite" }).toBeLessThanOrEqual(open.below.length);
});

test("téléphone : le dock est dessous, sur toute la largeur", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "disposition étroite");
  await openSheet(page, SHORT);
  const state = await zones(page);
  expect(state.aside).toEqual([]);
  expect(state.below.length).toBeGreaterThan(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
