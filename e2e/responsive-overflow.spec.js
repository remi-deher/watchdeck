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

/** Echoue si la courbe n'a pas recu de donnees : sans trace, les mesures geometriques
 *  de ce fichier passeraient sans rien verifier. */
async function expectChartHasCurve(page, minimum = TIMELINE_DAYS) {
  const line = page.locator(".line-chart path.line").first();
  await expect(line).toBeVisible({ timeout: 15_000 });
  const segments = await line.evaluate((node) => node.getAttribute("d").split("L").length);
  expect(segments, "la courbe doit etre alimentee").toBeGreaterThanOrEqual(minimum);
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

  test("le graphique ne pousse jamais la page a deborder", async ({ page }) => {
    // Les barres imposaient une largeur minimale chacune : sur une periode longue, le
    // panneau reclamait plusieurs milliers de pixels et etirait la grille entiere. Une
    // courbe se redimensionne, mais encore faut-il que le SVG ne compte pas sa taille
    // intrinseque (viewBox de 1000 unites) dans le calcul de la mise en page.
    await expectChartHasCurve(page);

    expect(await pageOverflows(page)).toBe(false);
    const overflows = await page.locator(".line-chart").first().evaluate((node) => {
      const parent = node.parentElement.getBoundingClientRect();
      return node.getBoundingClientRect().width > parent.width + 1;
    });
    expect(overflows, "la courbe deborde de son panneau").toBe(false);
  });

  test("les dates de l'axe ne se chevauchent pas", async ({ page }) => {
    await expectChartHasCurve(page);

    const boxes = await page.locator(".line-chart__x span").evaluateAll((nodes) =>
      nodes
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 0)
        .map((box) => ({ left: box.left, right: box.right }))
        .sort((a, b) => a.left - b.left),
    );

    expect(boxes.length, "l'axe doit porter des reperes").toBeGreaterThan(1);
    for (let index = 1; index < boxes.length; index += 1) {
      expect(
        boxes[index].left,
        `le repere ${index} chevauche le precedent`,
      ).toBeGreaterThanOrEqual(boxes[index - 1].right - 1);
    }
  });

  test("glisser sur la courbe zoome sur la plage choisie", async ({ page }, testInfo) => {
    // Le zoom se pilote a la souris ; sur un appareil tactile, un glisser horizontal
    // appartient au defilement de la page (`touch-action: pan-y`).
    test.skip(testInfo.project.name !== "desktop", "interaction souris");
    await expectChartHasCurve(page);
    const plot = page.locator(".line-chart__plot").first();
    const box = await plot.boundingBox();

    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    await expect(page.locator(".line-chart__reset").first()).toBeVisible();
    const segments = await page
      .locator(".line-chart path.line")
      .first()
      .evaluate((node) => node.getAttribute("d").split("L").length);
    expect(segments, "la fenetre doit etre reduite").toBeLessThan(TIMELINE_DAYS);
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
