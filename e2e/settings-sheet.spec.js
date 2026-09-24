import { expect, test } from "@playwright/test";

/**
 * Les formulaires de réglages (instances *arr, clients torrent, fournisseurs d'email)
 * s'ouvrent dans la même feuille que les fiches, à leur propre adresse.
 */

async function mockApi(page, calls) {
  const instances = [{ id: 3, name: "Radarr maison", arr_type: "radarr", url: "http://radarr:7878", api_key: "k", enabled: true }];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push(`${request.method()} ${url.pathname}`);
    if (url.pathname === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (url.pathname === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (url.pathname === "/api/arr-instances" && request.method() === "GET") return route.fulfill({ json: instances });
    if (url.pathname === "/api/arr-instances" && request.method() === "POST") return route.fulfill({ json: { id: 4 } });
    if (/\/api\/arr-instances\/\d+$/.test(url.pathname) && request.method() === "PUT") return route.fulfill({ json: { id: 3 } });
    if (url.pathname === "/api/download-clients" || url.pathname === "/api/email-providers") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
}

test("ajouter une instance *arr se fait dans la feuille, puis la referme", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/settings/services/integrations");
  const card = page.locator(".settings-card").filter({ hasText: "Instances Sonarr, Radarr et Prowlarr" });
  await expect(card).toContainText("Radarr maison", { timeout: 15000 });

  await card.getByRole("button", { name: "Ajouter" }).first().click();
  const sheet = page.locator(".media-overlay__panel");
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/resource\/arr\/new$/);
  await expect(sheet.getByRole("heading", { level: 1 })).toHaveText("Ajouter une instance");

  await sheet.getByLabel("Nom").fill("Sonarr 4K");
  await sheet.getByLabel("URL").fill("http://sonarr:8989");
  await sheet.getByLabel("Clé API").fill("secret");
  await sheet.getByRole("button", { name: "Ajouter" }).click();

  await expect.poll(() => calls.includes("POST /api/arr-instances")).toBe(true);
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/services\/integrations$/);
});

test("modifier une instance ouvre sa fiche préremplie, à son adresse", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/settings/services/integrations");
  const card = page.locator(".settings-card").filter({ hasText: "Instances Sonarr, Radarr et Prowlarr" });
  await expect(card).toContainText("Radarr maison", { timeout: 15000 });

  // La carte peut s'afficher repliee : on la deplie pour atteindre la ligne.
  const deplier = card.getByRole("button", { name: "Deplier" });
  if (await deplier.isVisible()) await deplier.click();
  await card.getByRole("button", { name: "Modifier" }).first().click();
  const sheet = page.locator(".media-overlay__panel");
  await expect(page).toHaveURL(/\/settings\/resource\/arr\/3$/);
  await expect(sheet.getByLabel("Nom")).toHaveValue("Radarr maison");

  // Annuler referme sans rien envoyer.
  await sheet.getByRole("button", { name: "Annuler" }).click();
  await expect(sheet).toHaveCount(0);
  expect(calls.some((call) => call.startsWith("PUT "))).toBe(false);
});
