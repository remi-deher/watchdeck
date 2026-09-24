import { expect, test } from "@playwright/test";

/**
 * Parcours de la page « Améliorations VF & Flux » (VfUpgradesView).
 *
 * Écrit AVANT le découpage de la vue (2 200 lignes) : il fige le comportement visible
 * que chaque extraction doit préserver -- audit des pistes, sélection de suggestions,
 * « Rechercher la sélection » et ouverture des réglages. L'API est simulée ; seules
 * les requêtes que la page émet sont vérifiées.
 */

function suggestion(id, overrides = {}) {
  return {
    id,
    source_type: "library_item",
    source_id: 40 + id,
    scope: "movie",
    season_number: null,
    episode_number: null,
    status: "pending",
    scanned_at: "2026-08-09T12:00:00Z",
    releases: [{ guid: `release-${id}`, title: `Film.${id}.MULTI` }],
    release_count: 1,
    media: { title: `Film VF ${id}`, media_type: "movie", poster_url: null },
    ...overrides,
  };
}

const AUDIT_ITEMS = [
  {
    id: 7, title: "Film audité", media_type: "movie", year: 2021, poster_url: null,
    has_vf: true, fr_is_default: false, sub_fr_status: "not_default", forced_fr_status: "ok",
    issues: ["audio_secondary", "sub_fr_not_default"],
  },
  {
    id: 8, title: "Film en VO", media_type: "movie", year: 2019, poster_url: null,
    has_vf: false, fr_is_default: false, sub_fr_status: "absent", forced_fr_status: null,
    issues: [],
  },
];

async function mockApi(page, calls) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push({ method: request.method(), path: url.pathname, body: request.postData() });
    if (url.pathname === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    // Flux temps reel : un flux vide au bon format, sinon le navigateur le rejette en erreur.
    if (url.pathname === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (url.pathname === "/api/vf-upgrades/dashboard") {
      return route.fulfill({ json: { items: [suggestion(1), suggestion(2), suggestion(3)], scan: {}, waiting_total: 0 } });
    }
    if (url.pathname === "/api/vf-upgrades/audit") {
      return route.fulfill({ json: { items: AUDIT_ITEMS, counts: { total: 2, audio_secondary: 1, sub_fr_not_default: 1, forced_sub_not_default: 0, partial_vf: 0 } } });
    }
    if (url.pathname === "/api/vf-upgrades/scan-selected") return route.fulfill({ json: { scanned: 2, found: 1 } });
    if (url.pathname === "/api/vf-upgrades/scan-runs") return route.fulfill({ json: { runs: [] } });
    if (url.pathname === "/api/vf-upgrades/scan-status") return route.fulfill({ json: { status: "idle" } });
    if (url.pathname === "/api/settings") return route.fulfill({ json: { vf_upgrade_min_confidence: 65 } });
    return route.fulfill({ json: {} });
  });
}

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "parcours fonctionnel, une largeur suffit");
});

test("l'audit liste les médias et leur diagnostic audio / sous-titres", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/vf-upgrades");

  await page.getByRole("tab", { name: /Alignement des pistes/ }).click();
  const cards = page.locator(".audit-card");
  await expect(cards).toHaveCount(2, { timeout: 15000 });
  const first = cards.filter({ hasText: "Film audité" });
  await expect(first).toContainText("Piste secondaire");
  await expect(first).toContainText("Présents (inactifs)");
  // Un média alignable propose l'alignement ; un média en VO pure ne le propose pas.
  await expect(first.getByRole("button", { name: "Aligner sur Plex" })).toBeVisible();
  await expect(cards.filter({ hasText: "Film en VO" }).getByRole("button", { name: "Aligner sur Plex" })).toHaveCount(0);
  // Le filtre « prêts à aligner » est compté dans la barre d'outils.
  await expect(page.getByRole("button", { name: /Tout aligner \(1\)/ })).toBeVisible();
});

test("sélectionner des suggestions puis « Rechercher la sélection » envoie les bons médias", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/vf-upgrades");

  const cards = page.locator(".upgrade-card");
  await expect(cards).toHaveCount(3, { timeout: 15000 });
  await expect(page.getByRole("button", { name: /Rechercher la sélection/ })).toHaveCount(0);

  await cards.filter({ hasText: "Film VF 1" }).getByRole('checkbox').check();
  await cards.filter({ hasText: "Film VF 3" }).getByRole('checkbox').check();
  const scan = page.getByRole("button", { name: /Rechercher la sélection \(2\)/ });
  await expect(scan).toBeVisible();

  await scan.click();
  await expect.poll(() => calls.find((call) => call.path === "/api/vf-upgrades/scan-selected")).toBeTruthy();
  const sent = JSON.parse(calls.find((call) => call.path === "/api/vf-upgrades/scan-selected").body);
  expect(sent.media).toEqual([
    { source_type: "library_item", source_id: 41 },
    { source_type: "library_item", source_id: 43 },
  ]);
  // Le résultat s'affiche et la sélection est vidée.
  await expect(page.getByText("2 recherche(s), 1 suggestion(s) trouvée(s).")).toBeVisible();
  await expect(page.getByRole("button", { name: /Rechercher la sélection/ })).toHaveCount(0);
});

test("le bouton Réglages ouvre la modale des réglages VF", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/vf-upgrades");
  await expect(page.locator(".upgrade-card").first()).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "Réglages des améliorations VF" }).click();
  await expect(page.getByRole("dialog", { name: /Réglages des améliorations VF/ })).toBeVisible();
});

test("les trois onglets s'affichent sans erreur ni avertissement Vue", async ({ page }) => {
  // Un composant ou une icone non importe ne casse rien de visible : Vue se contente
  // d'un avertissement. C'est ce qui guette un decoupage de vue.
  const problems = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" || text.includes("[Vue warn]")) problems.push(text);
  });
  page.on("pageerror", (error) => problems.push(error.message));
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/vf-upgrades");
  await expect(page.locator(".upgrade-card").first()).toBeVisible({ timeout: 15000 });

  await page.getByRole("tab", { name: /Alignement des pistes/ }).click();
  await expect(page.locator(".audit-card").first()).toBeVisible();
  await page.getByRole("tab", { name: /Historique des scans/ }).click();
  await expect.poll(() => calls.some((call) => call.path === "/api/vf-upgrades/scan-runs")).toBe(true);
  await page.getByRole("tab", { name: /Releases/ }).click();
  await expect(page.locator(".upgrade-card").first()).toBeVisible();

  expect(problems).toEqual([]);
});
