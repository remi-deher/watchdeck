import { expect, test } from "@playwright/test";

/**
 * Non-regression des debordements signales sur tablette et telephone.
 *
 * Trois defauts avaient ete remontes depuis de vrais appareils : le graphique
 * d'activite tronque et non defilable sur mobile, les dates de son axe qui se
 * chevauchaient, et le badge « Distribution globale » de la page Notifications qui
 * s'echappait au-dessus de son en-tete.
 *
 * Aucun test ne les couvrait, et ils sont invisibles au clavier comme au build :
 * la page se charge, aucune erreur n'apparait, le contenu est simplement illisible.
 * Ce fichier verifie donc des proprietes geometriques mesurees dans le navigateur,
 * la seule chose qui distingue reellement une mise en page correcte d'une cassee.
 */

const TIMELINE_DAYS = 30;

function timeline() {
  const labels = [];
  const values = [];
  const base = new Date("2026-07-21T00:00:00Z");
  for (let index = 0; index < TIMELINE_DAYS; index += 1) {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() + index);
    labels.push(day.toISOString().slice(0, 10));
    values.push((index * 7) % 10);
  }
  return {
    labels,
    values,
    series: { requests: values, availability: values, notifications: values },
  };
}

async function mockApi(page, { snapshot = null } = {}) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/session") {
      await route.fulfill({ json: { role: "admin", is_owner: true } });
      return;
    }
    // Le tableau de bord tente d'abord un flux SSE, puis se replie sur le snapshot
    // complet (voir DashboardView.vue). On coupe le flux pour emprunter ce repli,
    // bien plus simple a alimenter qu'un NDJSON en plusieurs morceaux.
    if (pathname === "/api/dashboard/snapshot/stream") {
      await route.abort();
      return;
    }
    if (snapshot && pathname === "/api/dashboard/snapshot") {
      await route.fulfill({ json: snapshot });
      return;
    }
    // Les endpoints de liste doivent renvoyer un tableau : un objet vide declenche
    // un avertissement Vue de type de prop et brouille la sortie des tests.
    if (pathname === "/api/users") {
      await route.fulfill({ json: [] });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

/** Echoue si le graphique n'a pas recu de donnees : sans barres, les mesures
 *  geometriques de ce fichier passeraient sans rien verifier. */
async function expectChartHasBars(page, minimum = TIMELINE_DAYS) {
  const bars = page.locator(".bar-chart-area .bar-item");
  await expect(bars.first()).toBeVisible({ timeout: 15_000 });
  expect(await bars.count(), "le graphique doit etre alimente").toBeGreaterThanOrEqual(minimum);
}

/** Vrai si la page entiere deborde horizontalement (barre de defilement globale). */
function pageOverflows(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

test.describe("Graphique d'activite", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { snapshot: { timeline: timeline() } });
    await page.goto("/dashboard");
    // La section Activite est repliee par defaut (UiDisclosure) : son contenu n'est
    // monte qu'a la premiere ouverture, donc le graphique n'existe pas avant ce clic.
    await page.locator(".ui-disclosure summary").filter({ hasText: "Activité" }).first().click();
  });

  test("le graphique se defile horizontalement au lieu d'etre tronque", async ({ page }) => {
    await expectChartHasBars(page);
    const area = page.locator(".bar-chart-area").first();

    // La zone doit pouvoir defiler par elle-meme. Sans cela, les barres qui
    // depassent restaient simplement inaccessibles : overflow-x:clip sur <html>
    // avale le debordement sans jamais afficher de barre de defilement.
    const canScrollIndependently = await area.evaluate((node) => {
      const style = window.getComputedStyle(node);
      return ["auto", "scroll"].includes(style.overflowX);
    });
    expect(canScrollIndependently).toBe(true);
  });

  test("le debordement des barres reste contenu dans le graphique", async ({ page }) => {
    await expectChartHasBars(page);
    const area = page.locator(".bar-chart-area").first();

    const { scrollWidth, clientWidth } = await area.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));

    if (scrollWidth > clientWidth) {
      // Le graphique deborde : c'est attendu sur petit ecran avec 30 barres, mais
      // ce debordement ne doit surtout pas se propager a la page entiere.
      expect(await pageOverflows(page)).toBe(false);
    }
  });

  test("les dates de l'axe ne se chevauchent pas", async ({ page }) => {
    await expectChartHasBars(page);

    const boxes = await page.locator(".bar-chart-area .bar-label").evaluateAll((nodes) =>
      nodes
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 0)
        .map((box) => ({ left: box.left, right: box.right }))
        .sort((a, b) => a.left - b.left),
    );

    // Le defaut d'origine venait du dernier label, force en plus de l'intervalle
    // regulier : il se superposait a son voisin ("18/0" par-dessus "9/08").
    for (let index = 1; index < boxes.length; index += 1) {
      expect(
        boxes[index].left,
        `le label ${index} chevauche le precedent`,
      ).toBeGreaterThanOrEqual(boxes[index - 1].right - 1);
    }
  });
});

test.describe("En-tete des notifications", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/notifications");
  });

  test("le badge de distribution reste dans ses limites", async ({ page }) => {
    const badge = page.locator(".notification-control").first();
    await expect(badge).toBeVisible({ timeout: 15_000 });

    // Le texte se coupait caractere par caractere (overflow-wrap:anywhere est global)
    // et sortait par le haut du badge, qui a une hauteur fixe.
    const contained = await badge.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return Array.from(node.querySelectorAll("*")).every((child) => {
        const childBox = child.getBoundingClientRect();
        if (childBox.width === 0 && childBox.height === 0) return true;
        return childBox.top >= box.top - 1 && childBox.bottom <= box.bottom + 1;
      });
    });

    expect(contained, "un element deborde verticalement hors du badge").toBe(true);
  });

  test("la page ne deborde pas horizontalement", async ({ page }) => {
    await expect(page.locator(".notification-control").first()).toBeVisible({ timeout: 15_000 });
    expect(await pageOverflows(page)).toBe(false);
  });
});
