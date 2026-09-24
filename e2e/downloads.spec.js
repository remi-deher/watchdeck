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
      "/api/downloads/history": { items: [], errors: [] },
      "/api/downloads/clients": TORRENTS,
      "/api/downloads/global-stats": { download_speed: 2048, upload_speed: 0, connected: 1, total: 1, clients: [] },
      "/api/disk-space": [],
    }[url.pathname];
    await route.fulfill({ json: json ?? {} });
  });
  return calls;
}

test("la file d'attente regroupe les interventions et confirme avant de retirer", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/downloads?view=queue");
  const groups = page.locator(".download-group");
  await expect(groups.filter({ hasText: "Intervention requise" })).toContainText("Film bloqué");
  await expect(groups.filter({ hasText: "En téléchargement" })).toContainText("Film en cours 1080p");
  await expect(page.locator(".quality-badge").first()).toHaveText("1080P");

  await groups.filter({ hasText: "En téléchargement" }).getByRole("button", { name: "Retirer" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Retirer ce téléchargement ?");
  await page.getByRole("alertdialog").getByRole("button", { name: "Annuler" }).click();
  expect(calls.some((call) => call.startsWith("DELETE"))).toBe(false);
});

test("les episodes manquants sont regroupes par serie", async ({ page }) => {
  await mockApi(page);
  await page.goto("/downloads?view=missing");
  const section = page.locator(".wanted-section");
  // Une serie (deux episodes) et un film.
  await expect(section.locator(".panel-head .badge")).toHaveText("2 item(s)");
  await expect(section).toContainText("Série A");
  await expect(section).toContainText("Film manquant");
});

test("le tableau des torrents filtre, affiche les debits et ouvre l'inspecteur", async ({ page }) => {
  await mockApi(page);
  await page.goto("/downloads?view=clients&sub=instances");
  const table = page.locator(".torrent-table");
  await expect(table).toContainText("Alpha.2024.1080p");
  await expect(table).toContainText("Bravo.S01");
  await expect(page.locator(".global-speed-bar")).toContainText("2 Ko/s");
  await expect(page.locator(".global-speed-bar")).toContainText("Connecté");

  // La recherche comprend les operateurs.
  await page.getByRole("searchbox").first().fill("cat:series");
  await expect(table).not.toContainText("Alpha.2024.1080p");
  await expect(table).toContainText("Bravo.S01");

  await page.getByRole("button", { name: "Bravo.S01" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("En pause");
  await expect(drawer).toContainText("Maison");
  await expect(drawer.getByRole("button", { name: "Reprendre" })).toBeVisible();
});
