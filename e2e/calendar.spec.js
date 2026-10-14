import { expect, test } from "@playwright/test";

/** Calendrier (gabarit Anticiper) : vues, légende des états, recherche en agenda. */

const day = new Date();
const iso = (offset) => { const d = new Date(day.getFullYear(), day.getMonth(), Math.min(day.getDate(), 20) + offset, 12); return d.toISOString(); };
const EVENTS = [
  { instance: "Radarr", date: iso(0), title: "Dune", subtitle: "Sortie cinéma", type: "movie", release_type: "cinema", has_file: true, request_id: 1 },
  { instance: "Sonarr", date: iso(1), title: "Andor", subtitle: "S02E03", type: "episode", has_file: false, request_id: 2 },
];

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = { "/api/session": { id: 1, role: "admin", is_owner: true, plex_user_id: "a" }, "/api/calendar": EVENTS, "/api/discover/requesters": [] }[path];
    await route.fulfill({ json: json ?? {} });
  });
}

test("le calendrier affiche ses sorties, leur légende, et la recherche bascule en agenda", async ({ page }) => {
  await mockApi(page);
  await page.goto("/calendar");
  await expect(page.getByRole("list", { name: "Légende" })).toBeVisible();
  await page.getByRole("button", { name: "Agenda" }).click();
  await expect(page.getByText("Dune").first()).toBeVisible();
  await expect(page.getByText("Andor").first()).toBeVisible();

  await page.getByRole("searchbox").first().fill("Andor");
  await expect(page.locator(".calendar-search-scope")).toContainText("1 résultat");
  await expect(page.getByText("Dune")).toHaveCount(0);
});
