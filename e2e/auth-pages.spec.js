import { expect, test } from "@playwright/test";

/**
 * Pages publiques rendues par la SPA : connexion, installation, confidentialite.
 * Elles s'affichent sans le shell et sans charger de session ; leurs formulaires
 * parlent aux API JSON de app/routers/auth.py.
 */

const PRIVACY = {
  notification_retention_days: 30,
  poll_history_retention_days: null,
  login_attempt_retention_days: 14,
  audit_log_retention_days: 90,
  active_channels: ["Email", "Discord"],
  gdpr_contact_name: "Jeanne Martin",
  gdpr_contact_email: "jeanne@example.test",
};

async function mockApi(page, handlers = {}) {
  const calls = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    calls.push({ method: request.method(), pathname, body: request.postDataJSON?.() ?? null });
    const handler = handlers[`${request.method()} ${pathname}`];
    if (handler) return handler(route);
    if (pathname === "/api/privacy") return route.fulfill({ json: PRIVACY });
    return route.fulfill({ status: 404, json: { detail: "non simule" } });
  });
  return calls;
}

test("la connexion s'affiche sans shell ni session et relaie l'erreur du serveur", async ({ page }) => {
  const calls = await mockApi(page, {
    "POST /api/auth/login": (route) => route.fulfill({ status: 401, json: { detail: "Identifiants incorrects." } }),
  });
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);

  await page.getByLabel("Nom d'utilisateur").fill("admin");
  await page.getByLabel("Mot de passe", { exact: true }).fill("secret-incorrect");
  await page.getByLabel("Code 2FA").fill("123456");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();

  await expect(page.getByRole("alert")).toHaveText("Identifiants incorrects.");
  const login = calls.find((call) => call.pathname === "/api/auth/login");
  expect(login.body).toEqual({ username: "admin", password: "secret-incorrect", otp_code: "123456" });
  expect(calls.some((call) => call.pathname === "/api/session")).toBe(false);
});

test("une connexion reussie repart vers l'adresse demandee, jamais vers un autre hote", async ({ page }) => {
  await mockApi(page, {
    "POST /api/auth/login": (route) => route.fulfill({ json: { authenticated: true } }),
  });
  // Le rechargement complet vers la cible est intercepte : seule l'adresse compte ici.
  await page.route("**/library?tab=films", (route) => route.fulfill({ body: "<p>cible</p>", contentType: "text/html" }));
  await page.goto("/login?next=%2Flibrary%3Ftab%3Dfilms");
  await page.getByLabel("Nom d'utilisateur").fill("admin");
  await page.getByLabel("Mot de passe", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/library\?tab=films$/);

  await page.route("**/", (route) => route.fulfill({ body: "<p>accueil</p>", contentType: "text/html" }));
  await page.goto("/login?next=%2F%2Fevil.example");
  await page.getByLabel("Nom d'utilisateur").fill("admin");
  await page.getByLabel("Mot de passe", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:4173\/$/);
});

test("l'installation n'active la creation du compte qu'une fois le formulaire valide", async ({ page }) => {
  const calls = await mockApi(page, {
    "POST /api/auth/setup": (route) => route.fulfill({ json: { authenticated: true, redirect: "/settings?tab=connections" } }),
  });
  await page.route("**/settings?tab=connections", (route) => route.fulfill({ body: "<p>reglages</p>", contentType: "text/html" }));
  await page.goto("/setup");

  await expect(page.getByRole("heading", { name: "Bienvenue !" })).toBeVisible();
  await page.getByRole("button", { name: "Commencer la configuration" }).click();

  const submit = page.getByRole("button", { name: "Créer le compte" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Code d'installation").fill("1A2B-3C4D-5E6F");
  await page.getByLabel("Nom d'utilisateur").fill("admin");
  await page.getByLabel("Mot de passe", { exact: true }).fill("Password123!");
  await expect(page.getByText("Mot de passe fort")).toBeVisible();
  await page.getByLabel("Confirmer le mot de passe").fill("Password12");
  await expect(submit).toBeDisabled();
  await page.getByLabel("Confirmer le mot de passe").fill("Password123!");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page).toHaveURL(/\/settings\?tab=connections$/);
  const setup = calls.find((call) => call.pathname === "/api/auth/setup");
  expect(setup.body).toEqual({
    username: "admin",
    password: "Password123!",
    password_confirm: "Password123!",
    setup_code: "1A2B-3C4D-5E6F",
  });
});

test("la confidentialite affiche les reglages reels de l'instance", async ({ page }) => {
  await mockApi(page);
  await page.goto("/privacy");

  await expect(page.getByRole("heading", { name: "Politique de confidentialité" })).toBeVisible();
  await expect(page.getByText("Jeanne Martin")).toBeVisible();
  await expect(page.getByRole("link", { name: "jeanne@example.test" }).first()).toHaveAttribute("href", "mailto:jeanne@example.test");
  await expect(page.getByText("Email, Discord")).toBeVisible();
  await expect(page.getByText("30 jour(s)")).toBeVisible();
  await expect(page.getByText("indéfiniment")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
