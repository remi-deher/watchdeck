import { expect, test } from "@playwright/test";

/**
 * Casting, recommandations et titres similaires accompagnent le résumé.
 * Un autre onglet de la fiche ne les montre plus. La saga, elle, reste.
 */
const detail = {
  id: 1,
  title: "Dune",
  year: 2021,
  media_type: "movie",
  overview: "Un héritier part pour une planète de sable.",
  poster_url: "/poster/1.svg",
  in_library: true,
  library_id: 1,
  has_vf: true,
  genres: [],
  media: {},
  requests: [],
  cast: [{ tmdb_id: 287, name: "Acteur test", character: "Paul", profile_url: null }],
  recommendations: [{ tmdb_id: 550, media_type: "movie", title: "Film recommandé", year: 1999 }],
  similar: [{ tmdb_id: 551, media_type: "movie", title: "Film similaire", year: 2000 }],
  saga: {
    name: "Dune",
    items: [{ tmdb_id: 438631, media_type: "movie", title: "Dune", year: 2021 }],
  },
};

test("le casting, les recommandations et les similaires n'accompagnent que le résumé", async ({ page }) => {
  await page.route("**/poster/**", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"/>',
  }));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (path === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (path.startsWith("/api/media/detail")) return route.fulfill({ json: detail });
    return route.fulfill({ json: {} });
  });

  await page.goto("/library/media/library/1");
  const casting = page.getByRole("heading", { name: "Casting" });
  const recommended = page.getByRole("heading", { name: "Recommandés pour vous" });
  const similar = page.getByRole("heading", { name: "Titres similaires" });
  const saga = page.getByRole("heading", { name: "Saga — Dune" });

  await expect(casting).toBeVisible({ timeout: 15_000 });
  await expect(recommended).toBeVisible();
  await expect(similar).toBeVisible();
  await expect(saga).toBeVisible();

  await page.getByRole("tab", { name: "Pistes & langues" }).click();
  await expect(casting).toHaveCount(0);
  await expect(recommended).toHaveCount(0);
  await expect(similar).toHaveCount(0);
  await expect(saga).toBeVisible();

  await page.getByRole("tab", { name: "Résumé" }).click();
  await expect(casting).toBeVisible();
  await expect(recommended).toBeVisible();
  await expect(similar).toBeVisible();
});
