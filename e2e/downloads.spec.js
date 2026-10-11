import { expect, test } from "@playwright/test";

/**
 * La page Acquisition, section par section, sur des donnees simulees : file d'attente
 * regroupee, elements manquants, et tableau des torrents avec son tiroir d'inspection.
 * Elle assemble des sous-composants (groupes de la file, tableau, tiroir, barre de
 * debits) : ces tests verifient qu'ils restent branches ensemble.
 */

const ARR = [{ id: 1, name: "Radarr", arr_type: "radarr", enabled: true }, { id: 2, name: "Sonarr", arr_type: "sonarr", enabled: true }];
const CLIENTS = [{ id: 7, name: "Maison", enabled: true }];
const QUEUE = [
  { arr_type: "radarr", instance: "Radarr", instance_id: 1, queue_id: 11, id: 11, library_id: 40, title: "Film en cours 1080p", status: "downloading", progress: 40, timeleft: "10 min" },
  { arr_type: "radarr", instance: "Radarr", instance_id: 1, queue_id: 12, id: 12, title: "Film bloqué", status: "warning", tracked_download_state: "importBlocked", error: "Import bloqué", progress: 100 },
];
const WANTED = [
  { arr_type: "sonarr", instance_id: 2, arr_id: 5, series_title: "Série A", title: "Série A", season_number: 1, episode_index: 2, episode_number: "S01E02" },
  { arr_type: "sonarr", instance_id: 2, arr_id: 5, series_title: "Série A", title: "Série A", season_number: 1, episode_index: 1, episode_number: "S01E01" },
  { arr_type: "radarr", instance_id: 1, id: 30, title: "Film manquant" },
];
const TORRENTS = [
  { client_id: 7, client_name: "Maison", hash: "aaa", title: "Alpha.2024.1080p", status: "downloading", progress: 50, size: 1024 ** 3, download_speed: 2048, upload_speed: 0, eta: 600, category: "films", tags: "vff", trackers: "https://tracker.one/announce" },
  { client_id: 7, client_name: "Maison", hash: "bbb", title: "Bravo.S01", status: "pausedDL", progress: 10, size: 2 * 1024 ** 3, download_speed: 0, upload_speed: 0, eta: 0, category: "series", tags: "" },
];

async function mockApi(page) {
  const calls = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push(`${route.request().method()} ${url.pathname}`);
    const json = {
      "/api/session": { role: "admin", is_owner: true },
      "/api/users": [],
      "/api/arr-instances": ARR,
      "/api/download-clients": CLIENTS,
      "/api/arr/queue": QUEUE,
      "/api/downloads/direct": [],
      "/api/arr/wanted": WANTED,
      "/api/downloads/history": { items: [{ id: 90, title: "Film importé", media_type: "movie", source: "radarr", processing_mode: "automatic", completed_at: "2026-09-20T10:00:00Z" }], errors: [] },
      "/api/downloads/clients": TORRENTS,
      "/api/downloads/global-stats": { download_speed: 2048, upload_speed: 0, connected: 1, total: 1, clients: [] },
      "/api/disk-space": [],
    }[url.pathname];
    await route.fulfill({ json: json ?? {} });
  });
  return calls;
}

test("la file d'attente met l'intervention d'abord, avec sa cause, et confirme avant de retirer", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/downloads?view=queue");
  await expect(page.getByRole("heading", { name: "Demande une intervention" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("section.is-blocked")).toContainText("Film bloqué");
  await expect(page.locator("section.is-blocked")).toContainText("Aucun média de la bibliothèque ne réclame");
  await expect(page.locator("section.is-blocked").getByRole("button", { name: "Associer" })).toBeVisible();
  await expect(page.getByText("Film en cours 1080p")).toBeVisible();

  // Pas de cartes d'instances ni de bandeau « non associes » : la file ne montre que la file.
  await expect(page.locator(".download-group, .download-card-grid")).toHaveCount(0);

  await page.waitForLoadState("networkidle");
  const retirer = page.locator("section.is-blocked").getByRole("button", { name: "Retirer" });
  await retirer.scrollIntoViewIfNeeded();
  await retirer.click();
  await expect(page.getByRole("alertdialog")).toContainText("Retirer ce téléchargement ?");
  await page.getByRole("alertdialog").getByRole("button", { name: "Annuler" }).click();
  expect(calls.some((call) => call.startsWith("DELETE"))).toBe(false);
});

test("les episodes manquants sont regroupes par serie, dans l'onglet des Demandes", async ({ page }) => {
  await mockApi(page);
  // L'ancienne adresse mene a l'onglet des Demandes.
  await page.goto("/downloads?view=missing");
  await expect(page).toHaveURL(/\/discover\/requests\?onglet=manquants$/);
  const panel = page.locator(".missing-panel");
  // Une serie (deux episodes) et un film.
  await expect(panel.locator(".missing-panel__count")).toHaveText("2 éléments");
  await expect(panel).toContainText("Série A");
  await expect(panel).toContainText("Film manquant");
  await panel.getByRole("radio", { name: "Séries" }).or(panel.getByRole("button", { name: "Séries" })).click();
  await expect(panel.locator(".missing-panel__count")).toHaveText("1 élément");
  await expect(panel).not.toContainText("Film manquant");
});

test("le tableau des torrents filtre, affiche les debits et ouvre l'inspecteur", async ({ page }) => {
  await mockApi(page);
  await page.goto("/downloads?view=clients&sub=instances");
  const table = page.locator(".torrent-table");
  // Le tableau est charge a la demande : sa premiere compilation par le serveur de dev
  // depasse parfois les 5 s par defaut.
  await expect(table).toContainText("Alpha.2024.1080p", { timeout: 15_000 });
  await expect(table).toContainText("Bravo.S01");
  // Les debits et la connexion sont en retour de la capsule de la barre du haut.
  const debits = page.getByRole("region", { name: "Débits des clients torrent" });
  await expect(debits).toContainText("2 Ko/s");
  await expect(debits).toContainText("Connecté");

  // La recherche comprend les operateurs.
  await page.getByRole("searchbox").first().fill("cat:series");
  await expect(table).not.toContainText("Alpha.2024.1080p");
  await expect(table).toContainText("Bravo.S01");

  await page.getByRole("button", { name: "Bravo.S01", exact: true }).click();
  // La fiche du torrent s'ouvre dans la feuille, a sa propre adresse.
  await expect(page).toHaveURL(/\/downloads\/torrent\/7\/bbb$/);
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("En pause");
  await expect(drawer).toContainText("Maison");
  await expect(drawer.getByRole("button", { name: "Reprendre" })).toBeVisible();
});

test("« Terminés » mène à l'historique, qui n'est plus dans la file", async ({ page }) => {
  await mockApi(page);
  // L'ancienne adresse du filtre « Terminés » ouvre l'historique.
  await page.goto("/downloads?view=queue&sub=completed");
  await expect(page.getByText("Film importé")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("section.is-blocked, #track-running")).toHaveCount(0);

  // La file ne montre que les derniers terminés, avec un lien vers l'historique.
  await page.goto("/downloads?view=queue");
  await expect(page.getByRole("link", { name: "Voir l’historique" })).toBeVisible({ timeout: 30_000 });

  await page.goto("/downloads?view=clients&sub=instances");
  await expect(page.locator(".torrent-table")).toBeVisible();
  await expect(page.getByText("Film importé")).toHaveCount(0);
});
