import { expect, test } from "@playwright/test";

/**
 * La recherche interactive d'une demande s'ouvre dans la feuille, par-dessus Workflow >
 * Demandes, et non plus en pleine page : la liste reste derriere et se retrouve a la
 * fermeture.
 */

const demande = {
  id: 42,
  title: "Film introuvable",
  year: 2024,
  media_type: "movie",
  status: "approved",
  requested_at: "2026-09-20T10:00:00Z",
  tracking: { kind: "not_found", label: "Introuvable", since: "2026-09-20T10:00:00Z" },
};

const releases = [
  { guid: "a", title: "Film.Introuvable.2024.FRENCH.1080p", indexer: "Indexeur FR", quality: "1080p", size: 4 * 1024 ** 3, seeders: 12, custom_format_score: 150, is_french: true },
  { guid: "b", title: "Film.Introuvable.2024.1080p", indexer: "Indexeur EN", quality: "1080p", size: 3 * 1024 ** 3, seeders: 40, custom_format_score: 0, is_french: false },
];

async function preparer(page) {
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (p === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (p === "/api/requests-list") return route.fulfill({ json: { items: [demande], facets: {} } });
    if (p === "/api/requests/orphans") return route.fulfill({ json: [] });
    if (p === "/api/requests/42") return route.fulfill({ json: demande });
    if (p === "/api/arr/releases") return route.fulfill({ json: releases });
    if (p === "/api/arr/root-folder") return route.fulfill({ json: { root_folder_path: "/films" } });
    return route.fulfill({ json: {} });
  });
}

test("« Recherche interactive » ouvre la feuille des releases au-dessus des demandes", async ({ page }, info) => {
  await preparer(page);
  await page.goto("/discover/requests");
  await page.getByRole("button", { name: "Recherche interactive" }).click();

  const feuille = page.locator(".media-overlay__panel");
  await expect(feuille).toBeVisible();
  await expect(page).toHaveURL(/\/releases\/42$/);
  await expect(feuille.getByRole("heading", { name: "Film introuvable" })).toBeVisible();
  await expect(feuille.locator(".release-row")).toHaveCount(2);
  // La liste des demandes reste derriere la feuille.
  await expect(page.locator(".rt-grid")).toHaveCount(1);
  await page.waitForTimeout(700); // fin de l'ouverture
  await page.screenshot({ path: info.outputPath("feuille.png") });

  await page.keyboard.press("Escape");
  await expect(feuille).toHaveCount(0);
  await expect(page).toHaveURL(/\/discover\/requests/);
});

test("ouverte par son adresse, la recherche interactive s'affiche en pleine page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "une largeur suffit");
  await preparer(page);
  await page.goto("/releases/42");
  await expect(page.locator(".media-overlay__panel")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Film introuvable" })).toBeVisible();
  await expect(page.locator(".release-row")).toHaveCount(2);
});
