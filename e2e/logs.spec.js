import { expect, test } from "@playwright/test";

/** Journaux (gabarit Comprendre) : bilan, journal par source, détail technique d'une entrée. */

const NOW = new Date().toISOString();
const DIAG = [
  { id: 1, created_at: NOW, category: "arr", title: "Dune", action: "send", message: "Radarr a refusé", status: "error", request_id: 7, details: { code: 500 } },
  { id: 2, created_at: NOW, category: "plex", title: "Arrival", action: "scan", message: "OK", status: "success" },
];

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = {
      "/api/session": { role: "admin", is_owner: true },
      "/api/diagnostic-logs": DIAG,
      "/api/logs/summary": { total: 1, errors: { diagnostic: 1, app: 0, polls: 0, notifications: 0 } },
      "/api/logs": [{ time: NOW, level: "INFO", message: "Démarrage", logger: "app" }],
    }[path];
    await route.fulfill({ json: json ?? {} });
  });
}

test("le bilan, la chronologie et le détail technique d'une entrée", async ({ page }) => {
  await mockApi(page);
  await page.goto("/logs");
  await expect(page.locator(".understand__summary")).toContainText("1");
  await expect(page.locator(".understand-row")).toHaveCount(2);

  await page.getByRole("group", { name: "Résultat" }).getByRole("button", { name: "Erreurs seulement" }).click();
  await expect(page.locator(".understand-row")).toHaveCount(1);

  await page.locator(".understand-row").first().click();
  const detail = page.getByRole("complementary", { name: /Détail : Dune/ });
  await expect(detail).toContainText("Radarr a refusé");
  await expect(detail).toContainText('"code": 500');
  await expect(detail.getByText("Ouvrir la demande #7")).toBeVisible();
});

test("chaque source a son journal, gardé dans l'adresse", async ({ page }) => {
  await mockApi(page);
  await page.goto("/logs");
  // Les journaux sont les vues de la page : ils s'ouvrent en menu depuis la section courante.
  await page.getByRole("button", { name: "Journaux · Demandes" }).click();
  await page.getByRole("menuitem", { name: "Application" }).click();
  await expect(page).toHaveURL(/type=app/);
  await expect(page.locator(".understand-row")).toContainText("Démarrage");
});
