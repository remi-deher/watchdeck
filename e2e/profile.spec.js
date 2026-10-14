import { expect, test } from "@playwright/test";

/** Profil (gabarit Fiche) : identité et chiffres en tête, une alerte de sécurité, parties en onglets. */

const ME = {
  id: 3, plex_user_id: "camille", display_name: "Camille Durand", role: "user", source: "plex",
  has_local_password: false, totp_enabled: false, passkey_count: 0,
  preferences: {}, stats: { total: 4, available: 3, pending: 1 },
  recent_requests: [{ id: 1, title: "Dune", status: "available" }],
};

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = { "/api/session": { id: 3, role: "user", username: "camille" }, "/api/me": ME }[path];
    await route.fulfill({ json: json ?? {} });
  });
}

test("le profil est une fiche : identité, alerte de sécurité, onglets", async ({ page }) => {
  await mockApi(page);
  await page.goto("/profile");
  await expect(page.locator(".detail__title")).toHaveText("Camille Durand");
  await expect(page.locator(".detail__facts")).toContainText("Mes demandes");
  await expect(page.locator(".detail__alert")).toBeVisible();

  await page.locator(".detail__alert").getByRole("button").click();
  await expect(page.getByRole("tab", { name: /Sécurité/ })).toHaveAttribute("aria-selected", "true");
});
