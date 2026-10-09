import { expect, test } from "@playwright/test";

/**
 * Les pages Encodage sur leurs gabarits, avec un FileFlows simule : Vue d'ensemble
 * (Surveiller), File (Suivre), Historique (Comprendre), Statistiques (Analyser), et la
 * configuration (Configurer). Ces tests verifient que chaque page tient debout dans le
 * shell, a toutes les tailles d'ecran.
 */

const NOW = new Date().toISOString();
const MEDIA = { id: 7, title: "Anaconda", year: 1997, media_type: "movie" };
const RUNNER = { path: "/usb2/a.mkv", name: "/usb2/MEDIA/FILMS/Psycho-Pass.mkv", library: "Films — USB 2", step: "4. Assemblage", percent: 88, media: null };
const FAILED = { uid: "f1", name: "/usb3/Anaconda.mkv", library: "Films — USB 3", status: 4, failure_reason: "Durée audio différente", media: MEDIA };
const STATUS = {
  configured: true, connected: true, queue: 230, processing: 1, processed: 172, failed: 1,
  runners: [RUNNER], recent_failed: [FAILED],
  recent_processed: [{ uid: "p1", name: "/usb1/Dune.mkv", library: "Films — USB 1", status: 1, media: null, timing: { processing_seconds: 240 } }],
};
const OVERVIEW = {
  state: { queue: 230, processing: 1, processed: 172, failed: 1, paused: false, paused_until: null },
  disks: [
    { disk: "usb2", libraries: ["Films — USB 2"], waiting: 56, running: [RUNNER], lock_waiting: 3, plex_paused: false, plex_playing: false },
    { disk: "usb1", libraries: ["Films — USB 1"], waiting: 170, running: [], lock_waiting: 0, plex_paused: true, plex_playing: true },
    { disk: "usb3", libraries: ["Films — USB 3"], waiting: 3, running: [], lock_waiting: 0, plex_paused: false, plex_playing: false },
  ],
  throughput: { per_hour: 6, window_minutes: 60 }, eta_hours: 38,
  automations: { reorder: true, plex_pause: "disk", runners_mode: "manual" },
};
const PASSES = [
  { id: 1, file_uid: "f1", status: "failed", kind: null, path: "/usb3/Anaconda.mkv", library: "Films — USB 3", disk: "usb3", flow: "V3", library_item_id: 7, ended_at: NOW, processing_seconds: 120, wait_seconds: 0, original_size: 8e9, final_size: null, failure_reason: "Durée audio différente", before: { video: { codec: "h264" } }, after: null },
  { id: 2, file_uid: "p1", status: "processed", kind: "encode", path: "/usb1/Dune.mkv", library: "Films — USB 1", disk: "usb1", flow: "V3", library_item_id: null, ended_at: NOW, processing_seconds: 240, wait_seconds: 0, original_size: 9e9, final_size: 5e9, failure_reason: null, before: { video: { codec: "h264" } }, after: { video: { codec: "hevc" } } },
];
const STATS = { days: 30, processed: 142, failed: 3, saved_bytes: 212e9, average_seconds: 300, per_day: [{ day: NOW.slice(0, 10), processed: 10, failed: 1 }], kinds: { encode: 100, rewrite: 42 }, disks: [{ disk: "usb1", count: 90, average_seconds: 280, average_wait_seconds: 0 }, { disk: "usb2", count: 52, average_seconds: 610, average_wait_seconds: 120 }], steps: [{ name: "3. Vidéo", count: 100, average_seconds: 200 }, { name: "1. Sous-titres", count: 100, average_seconds: 12 }] };
const CONTROL = { runners_mode: "manual", runners: 4, max_runners: 5, plex_pause: "disk", plex_pause_relaunched: "follow", plex_resume_minutes: 5, reorder_enabled: true, schedule_restricted: false, schedule_preset: "always", alert_channels: ["ntfy"], channels_ready: { email: true, discord: false, telegram: false, ntfy: true, gotify: false }, guard: null };
const LIBRARIES = {
  libraries: [
    { uid: "l1", name: "Films — USB 2", path: "/usb2/MEDIA/FILMS", disk: "usb2", enabled: true, flow: { uid: "v3", name: "Flow V3" }, waiting: 56, last_scanned: null, reorder: true, plex_location: "/usb2/MEDIA/FILMS", plex_location_confirmed: true, plex_location_suggested: null, shared_disk: false },
    { uid: "l2", name: "Séries — USB 1", path: "/usb/MEDIA/SERIES", disk: "usb", enabled: false, flow: { uid: "v3", name: "Flow V3" }, waiting: 0, last_scanned: null, reorder: false, plex_location: null, plex_location_confirmed: false, plex_location_suggested: "/usb/MEDIA/SERIES", shared_disk: false },
  ],
  flows: [{ uid: "v3", name: "Flow V3", used_by: ["Films — USB 2"] }],
  plex_locations: [],
};
const FLOWS = { flows: [{ uid: "v3", name: "Flow V3", description: "", revision: 10, modified: null, steps: ["0. Verrou du disque", "1. Sous-titres"], used_by: ["Films — USB 2"] }] };

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname, status = url.searchParams.get("status");
    const json =
      path === "/api/session" ? { role: "admin", is_owner: true }
      : path === "/api/fileflows/status" ? STATUS
      : path === "/api/fileflows/overview" ? OVERVIEW
      : path === "/api/fileflows/control" ? CONTROL
      : path === "/api/fileflows/libraries" ? LIBRARIES
      : path === "/api/fileflows/flows" ? FLOWS
      : path === "/api/fileflows/history" ? { stats: STATS, recent: PASSES }
      : path === "/api/fileflows/files" && status === "0" ? { files: [{ uid: "q1", name: "/usb1/Lilo.mkv", library: "Films — USB 1", status: 0, relaunched: true }, { uid: "q2", name: "/usb3/Heat.mkv", library: "Films — USB 3", status: 0 }], has_more: false }
      : path === "/api/fileflows/files" && status === "4" ? { files: [FAILED], has_more: false }
      : {};
    await route.fulfill({ json });
  });
}

const PAGES = [
  ["/encoding", ".monitor", "vue-d-ensemble"],
  ["/encoding/queue", ".track", "file"],
  ["/encoding/history", ".understand", "historique"],
  ["/encoding/stats", ".analyze", "statistiques"],
  ["/encoding/libraries", ".configure", "bibliotheques"],
  ["/encoding/flows", ".configure", "flows"],
  ["/encoding/settings", ".configure", "reglages"],
];

for (const [path, selector, name] of PAGES) {
  test(`Encodage · ${name} sur son gabarit`, async ({ page }, testInfo) => {
    await mockApi(page);
    await page.goto(path);
    await expect(page.locator(selector).first()).toBeVisible({ timeout: 15_000 });
    // Une seule rangee d'onglets : celle de la page.
    expect(await page.locator(".app-page__sticky .app-subnav").count()).toBeLessThanOrEqual(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, "débordement horizontal").toBe(false);
    if (process.env.ENCODING_SHOTS) await page.screenshot({ path: `${process.env.ENCODING_SHOTS}/${testInfo.project.name}-${name}.png`, fullPage: true });
  });
}
