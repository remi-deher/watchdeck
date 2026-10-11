import { expect, test } from "@playwright/test";

/**
 * Utilisateurs (gabarit Gerer) : situations qui filtrent, tableau de controle avec ses
 * actions de ligne et de selection, confirmation avant ce qui change des droits.
 */

const USERS = [
  { id: 1, custom_name: "Alice", plex_user_id: "alice", enabled: true, role: "admin", can_login: true, notification_email: "a@x.fr", stats: { total: 4 } },
  { id: 2, custom_name: "Bruno", plex_user_id: "bruno", enabled: false, role: "user", can_login: true, notification_email: "b@x.fr", stats: { total: 0 } },
  { id: 3, custom_name: "Chloé", plex_user_id: "chloe", enabled: true, role: "user", can_login: true, stats: { total: 2, pending_approval: 1 } },
];

async function mockApi(page) {
  const calls = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push({ path: url.pathname, method: route.request().method(), body: route.request().postData() });
    const json = {
      "/api/session": { role: "admin", is_owner: true },
      "/api/users": USERS,
      "/api/users/2": { ...USERS[1], stats: { total: 0 }, notification_history: [] },
      "/api/settings": { seer_enabled: false },
    }[url.pathname];
    await route.fulfill({ json: json ?? {} });
  });
  return calls;
}

test("les situations à traiter filtrent la liste des comptes", async ({ page }) => {
  await mockApi(page);
  await page.goto("/users");
  const table = page.getByRole("region", { name: "Tableau des utilisateurs" });
  await expect(table).toContainText("Alice");
  await expect(table).toContainText("Chloé");

  const situation = page.getByRole("group", { name: "Situations à traiter" }).getByRole("button", { name: /Approbations/ });
  await situation.click();
  await expect(situation).toHaveAttribute("aria-pressed", "true");
  await expect(table).toContainText("Chloé");
  await expect(table).not.toContainText("Alice");
});

test("un compte s'active depuis sa ligne, sans passer par la sélection", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/users");
  await page.getByRole("button", { name: "Activer Bruno" }).click();
  await expect.poll(() => calls.find((call) => call.path === "/api/users/2/enabled")?.body).toBe(JSON.stringify({ enabled: true }));
});

test("bloquer la connexion de la sélection demande confirmation", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/users");
  // La case d'une ligne, et non celle de l'en-tete : en cartes (telephone), l'en-tete est recouvert.
  await page.getByRole("checkbox", { name: "Sélectionner Alice" }).click();
  await expect(page.getByRole("toolbar", { name: "Actions groupées" })).toContainText("1 utilisateur sélectionné");

  await page.getByRole("button", { name: /Rôle & connexion/ }).click();
  await page.getByRole("menuitem", { name: /Bloquer la connexion/ }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Bloquer la connexion de 1 compte ?");
  expect(calls.some((call) => call.path === "/api/users/bulk/permissions")).toBe(false);

  await page.getByRole("alertdialog").getByRole("button", { name: "Bloquer la connexion" }).click();
  await expect.poll(() => calls.find((call) => call.path === "/api/users/bulk/permissions")?.body).toBe(JSON.stringify({ user_ids: [1], can_login: false }));
});

test("la fiche d'un compte porte ses actions dans l'en-tête et ses parties en onglets", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/users/2");
  await expect(page.locator(".detail__title")).toHaveText("Bruno");
  await expect(page.getByRole("tablist", { name: "Sections de la fiche" })).toContainText("Comptes liés");
  await page.getByRole("button", { name: "Activer le compte" }).click();
  await expect.poll(() => calls.find((call) => call.path === "/api/users/2/enabled")?.body).toBe(JSON.stringify({ enabled: true }));
});

test("ajouter un compte passe par la fenêtre de création", async ({ page }) => {
  await mockApi(page);
  await page.goto("/users");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByRole("dialog")).toContainText("Compte Plex");
  await expect(page.getByRole("dialog")).toContainText("Compte local");
});
