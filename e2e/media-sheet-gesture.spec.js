import { expect, test } from "@playwright/test";

/**
 * Fermer la fiche media en la tirant vers le bas, depuis son contenu.
 *
 * Le geste des feuilles d'iOS : contenu en haut, un glissement vers le bas n'importe ou
 * emporte la fiche ; contenu defile, le meme glissement le fait remonter. Les touches
 * sont envoyees par le protocole du navigateur (vrais evenements tactiles, et non une
 * souris deguisee), d'ou la restriction a Chromium.
 */

const item = (id) => ({ id, title: `Film ${id}`, year: 2001, media_type: "movie", poster_url: `/poster/${id}.svg`, genres: [], has_vf: true });

async function preparer(page) {
  await page.route("**/poster/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>' }));
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (p === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (p === "/api/library") return route.fulfill({ json: Array.from({ length: 30 }, (_, i) => item(i + 1)) });
    if (p === "/api/requests-list") return route.fulfill({ json: { items: [], facets: {} } });
    if (p === "/api/requests/orphans") return route.fulfill({ json: [] });
    if (p.startsWith("/api/media/detail")) return route.fulfill({ json: { ...item(1), media: {}, overview: "Synopsis. ".repeat(400), requests: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/library?type=movie&query=Film");
  await page.locator(".media-grid > .poster-card").first().click();
  await expect(page.locator(".media-overlay__panel")).toBeVisible();
  await page.waitForTimeout(700); // fin de l'ouverture
}

async function glisser(page, x, de, a) {
  const cdp = await page.context().newCDPSession(page);
  const point = (y) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(de) });
  for (let i = 1; i <= 12; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(de + ((a - de) * i) / 12) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("contenu en haut : tirer la fiche vers le bas depuis son contenu la referme", async ({ page, browserName }, info) => {
  test.skip(info.project.name !== "mobile" || browserName !== "chromium", "touches natives Chromium, en compact");
  await preparer(page);
  const box = await page.locator(".media-overlay__scroll").boundingBox();
  await glisser(page, box.x + box.width / 2, box.y + 120, box.y + 520);
  await expect(page.locator(".media-overlay__panel")).toHaveCount(0);
  await expect(page).toHaveURL(/\/library\?type=movie&query=Film/);
  // La grille de fond est restee en place.
  await expect(page.locator(".media-grid > .poster-card")).toHaveCount(30);
});

test("contenu defile : le meme glissement fait remonter la lecture, pas la fiche", async ({ page, browserName }, info) => {
  test.skip(info.project.name !== "mobile" || browserName !== "chromium", "touches natives Chromium, en compact");
  await preparer(page);
  const scroller = page.locator(".media-overlay__scroll");
  await scroller.evaluate((el) => { el.scrollTop = 600; });
  const box = await scroller.boundingBox();
  await glisser(page, box.x + box.width / 2, box.y + 120, box.y + 420);
  await page.waitForTimeout(400);
  await expect(page.locator(".media-overlay__panel")).toBeVisible();
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeLessThan(600);
});

test("un petit glissement relache doucement : la fiche revient a sa place", async ({ page, browserName }, info) => {
  test.skip(info.project.name !== "mobile" || browserName !== "chromium", "touches natives Chromium, en compact");
  await preparer(page);
  const box = await page.locator(".media-overlay__scroll").boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: box.y + 100, id: 1 }] });
  for (let i = 1; i <= 10; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: box.y + 100 + i * 9, id: 1 }] });
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200); // on s'arrete avant de lacher : aucun elan
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(700);
  const panel = page.locator(".media-overlay__panel");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => el.style.transform)).toBe("");
});

test("le tiroir des filtres se referme du meme geste", async ({ page, browserName }, info) => {
  test.skip(info.project.name !== "mobile" || browserName !== "chromium", "touches natives Chromium, en compact");
  await page.goto("/discover/requests");
  await page.getByRole("button", { name: /filtres/i }).click();
  const panel = page.locator(".modal-panel");
  await expect(panel).toBeVisible();
  await page.waitForTimeout(700);
  const box = await panel.boundingBox();
  // Depuis le titre du tiroir, pas depuis la poignee.
  await glisser(page, box.x + box.width / 2, box.y + 60, box.y + 60 + box.height * 0.6);
  await expect(panel).toHaveCount(0);
});

test("a la fermeture, la fiche garde son contenu pendant qu'elle s'en va", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "une largeur suffit");
  await preparer(page);
  // Clic et lecture dans la meme evaluation, des le debut de la sortie : sous charge, un
  // aller-retour de plus avec le navigateur pouvait tomber apres sa fin.
  const pendant = await page.evaluate(async () => {
    const voile = document.querySelector(".media-overlay");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    // La fermeture passe par un retour d'historique : elle commence quelques images plus tard.
    for (let i = 0; i < 120 && voile.style.pointerEvents !== "none"; i += 1) {
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
    return { titre: voile?.querySelector("h1")?.textContent || "", appuis: voile ? getComputedStyle(voile).pointerEvents : "" };
  });
  // Le contenu disparaissait a l'instant du clic : c'est une surface vide qui glissait.
  expect(pendant.titre).toContain("Film");
  // Et la page reprend la main tout de suite : le voile sortant n'avale plus les appuis.
  expect(pendant.appuis).toBe("none");
  await expect(page.locator(".media-overlay")).toHaveCount(0);
});
