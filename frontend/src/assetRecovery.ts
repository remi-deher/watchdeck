const ASSET_RELOAD_KEY = 'watchdeck:asset-reload';
const RECOVERY_COOLDOWN_MS = 5_000;
const STALE_ASSET_PATTERN = /dynamically imported module|failed to fetch module|importing a module script|unable to preload|loading (css )?chunk|chunkloaderror/i;

export function isStaleAssetError(error: unknown): boolean {
  const value = error as any;
  return STALE_ASSET_PATTERN.test(String(value?.message || value || ''));
}

function readLastRecovery(): number {
  try { return Number(sessionStorage.getItem(ASSET_RELOAD_KEY) || 0); }
  catch { return 0; }
}

function rememberRecovery(now: number): void {
  try { sessionStorage.setItem(ASSET_RELOAD_KEY, String(now)); }
  catch { /* Le stockage privé iOS peut être indisponible. */ }
}

export async function purgeStaleAssetState(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if ('caches' in window) {
    tasks.push(caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('watchdeck-cache-')).map((key) => caches.delete(key)),
    )));
  }
  if ('serviceWorker' in navigator) {
    tasks.push(navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
      registrations.map((registration) => registration.unregister()),
    )));
  }
  await Promise.allSettled(tasks);
}

export async function recoverFromStaleAssets(error: unknown, force = false): Promise<boolean> {
  if (!force && !isStaleAssetError(error)) return false;
  const now = Date.now();
  if (now - readLastRecovery() < RECOVERY_COOLDOWN_MS) return false;
  rememberRecovery(now);
  await purgeStaleAssetState();
  const url = new URL(window.location.href);
  url.searchParams.set('_asset_reload', String(now));
  window.location.replace(url.toString());
  return true;
}
