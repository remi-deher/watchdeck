import { expect, test } from "@playwright/test";

/**
 * Notifications : la file d'attente (gabarit Gerer) et le journal (gabarit Comprendre),
 * avec l'etat de l'envoi automatique dans la capsule de la barre du haut.
 */

const PENDING = [
  { id: 11, event: "available", event_label: "Disponible", media_title: "Dune", recipient: "alice@x.fr", created_at: "2026-10-09T10:00:00Z" },
  { id: 12, event: "request", event_label: "Demande", media_title: "Tenet", recipient: "bruno@x.fr", created_at: "2026-10-09T11:00:00Z" },
];
const LOG = [
  { id: 1, event: "available", event_label: "Disponible", media_title: "Dune", recipient: "alice@x.fr", success: true, sent_at: "2026-10-09T10:00:00Z" },
  { id: 2, event: "request", event_label: "Demande", media_title: "Tenet", recipient: "bruno@x.fr", success: false, error_msg: "SMTP refusé", sent_at: "2026-10-09T11:00:00Z" },
];

async function mockApi(page) {
  const calls = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push({ path: url.pathname + url.search, method: route.request().method(), body: route.request().postData() });
    const json = {
      "/api/session": { role: "admin", is_owner: true },
      "/api/users": [{ id: 2, custom_name: "Bruno" }],
      "/api/notifications/pending": { items: PENDING, total: 2 },
      "/api/notifications/log": { items: LOG, total: 2 },
      "/api/notifications/hold": { enabled: false, pending_count: 2 },
      "/api/notifications/2/preview": { subject: "Tenet", html: "<p>Bonjour Bruno</p>", reconstructable: true },
    }[url.pathname];
    await route.fulfill({ json: json ?? {} });
  });
  return calls;
}

test("le journal montre les envois par jour et l'aperçu de l'email dans le détail", async ({ page }) => {
  await mockApi(page);
  await page.goto("/notifications?tab=history");
  await expect(page.getByRole("button", { name: /Dune/ })).toBeVisible();
  await page.getByRole("button", { name: /Tenet/ }).click();
  const detail = page.getByRole("complementary", { name: /Détail : Tenet/ });
  await expect(detail).toContainText("SMTP refusé");
  await expect(detail.frameLocator("iframe").getByText("Bonjour Bruno")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Renvoyer" })).toBeVisible();
});

test("l'état de l'envoi est dans la capsule, avec sa suspension", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/notifications?tab=pending");
  await expect(page.getByText("Envoi actif")).toBeVisible();
  await page.getByRole("button", { name: "Suspendre" }).click();
  await expect.poll(() => calls.find((call) => call.method === "PUT" && call.path === "/api/notifications/hold")?.body).toBe(JSON.stringify({ enabled: true }));
});

test("une notification en attente s'envoie depuis sa ligne", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/notifications?tab=pending");
  await expect(page.getByRole("region", { name: "Tableau des notifications en attente" })).toContainText("Dune");
  await page.getByRole("button", { name: "Envoyer Disponible" }).click();
  await expect.poll(() => calls.find((call) => call.path === "/api/notifications/pending/process")?.body).toBe(JSON.stringify({ ids: [11] }));
});

test("vider la file demande confirmation et vise toute la file", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/notifications?tab=pending");
  await page.getByRole("button", { name: /Vider la file/ }).click();
  await page.getByRole("menuitem", { name: "Tout supprimer" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Toute la file");
  expect(calls.some((call) => call.path === "/api/notifications/pending/purge")).toBe(false);
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect.poll(() => calls.find((call) => call.path === "/api/notifications/pending/purge")?.body).toBe(JSON.stringify({ ids: [], mark_handled: false }));
});
