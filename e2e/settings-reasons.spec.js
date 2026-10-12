import { expect, test } from "@playwright/test";

/** Motifs de message : l'ajout et la modification passent par une fenêtre du gabarit Créer. */

test("ajouter un motif passe par la fenêtre Créer et l'envoie au serveur", async ({ page }) => {
  const calls = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/session") return route.fulfill({ json: { role: "admin", is_owner: true } });
    if (path === "/api/message-reasons" && request.method() === "POST") calls.push(request.postDataJSON());
    if (path === "/api/message-reasons" && request.method() === "GET") return route.fulfill({ json: { items: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/settings/notifications/reasons");
  await page.getByRole("button", { name: "Ajouter un motif" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Libellé").fill("Doublon");
  await dialog.getByLabel("Message envoyé").fill("Cette demande existe déjà.");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => calls[0]).toMatchObject({ label: "Doublon", message: "Cette demande existe déjà.", event: "cancelled", enabled: true });
});
