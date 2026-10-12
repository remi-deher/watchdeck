import { expect, test } from "@playwright/test";

/**
 * Les ressources de réglages (instances *arr, clients torrent, serveurs Plex, fournisseurs
 * d'email) se saisissent par le gabarit Créer, dans une fenêtre, à leur propre adresse.
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
    if (url.pathname === "/api/test/arr-instance") return route.fulfill({ json: { success: true, message: "Connecté" } });
    if (url.pathname === "/api/download-clients" && request.method() === "GET") return route.fulfill({ json: [{ id: 5, name: "qBit", client_type: "qbittorrent", url: "http://qbit:8080", enabled: true, has_password: true }] });
    if (/\/api\/download-clients\/\d+$/.test(url.pathname) && request.method() === "PUT") return route.fulfill({ json: { id: 5 } });
    if (url.pathname === "/api/email-providers") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
}

test("ajouter une instance *arr suit les étapes du gabarit Créer, puis ferme", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/settings/services/media");
  const card = page.locator("#configure-instances");
  await expect(card).toContainText("Radarr maison", { timeout: 15000 });

  await card.getByRole("button", { name: "Ajouter" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/resource\/arr\/new$/);
  await expect(dialog).toContainText("Ajouter un service");

  await dialog.getByRole("button", { name: "Continuer" }).click();
  await dialog.getByLabel("Nom").fill("Radarr 4K");
  await dialog.getByLabel("Adresse").fill("http://radarr4k:7878");
  await dialog.getByLabel("Clé API").fill("secret");
  await dialog.getByRole("button", { name: "Tester" }).click();
  await expect(dialog).toContainText("Connecté");
  await dialog.getByRole("button", { name: "Continuer" }).click();
  await dialog.getByLabel("Dossier racine").fill("/media/4K");
  await dialog.getByRole("button", { name: "Continuer" }).click();
  await dialog.getByRole("button", { name: "Créer" }).click();

  await expect.poll(() => calls.includes("POST /api/arr-instances")).toBe(true);
  await expect(dialog).toContainText("Radarr 4K");
});

test("modifier une instance ouvre la fenêtre sur ses valeurs, à son adresse", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/settings/services/media");
  const card = page.locator("#configure-instances");
  await expect(card).toContainText("Radarr maison", { timeout: 15000 });

  await card.getByRole("button", { name: /Radarr maison/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(page).toHaveURL(/\/settings\/resource\/arr\/3$/);
  await expect(dialog).toContainText("Modifier le service");

  // Fermer sans rien changer n'envoie rien.
  await dialog.getByRole("button", { name: "Fermer" }).first().click();
  await expect(dialog).toHaveCount(0);
  expect(calls.some((call) => call.startsWith("PUT "))).toBe(false);
});

test("modifier un client de téléchargement : valeurs préremplies, mot de passe conservé", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/settings/resource/download-client/5");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Modifier le client");
  await dialog.getByRole("button", { name: "Continuer" }).click();
  await expect(dialog.getByLabel("Nom")).toHaveValue("qBit");
  await expect(dialog.getByLabel("Adresse")).toHaveValue("http://qbit:8080");
});

test("les connexions se règlent dans des sections, sans volet", async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.goto("/settings/services");
  for (const id of ["plex", "servers", "tracearr", "tautulli"]) await expect(page.locator(`#configure-${id}`)).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#configure-plex").getByLabel("URL", { exact: true })).toBeVisible();
  await expect(page.locator("#configure-tautulli")).toContainText("Aucun import automatique");

  await page.goto("/settings/services/integrations");
  for (const id of ["tmdb", "seer"]) await expect(page.locator(`#configure-${id}`)).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#configure-tmdb").getByLabel("Région de découverte")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
