/**
 * Enregistrement du Service Worker PWA pour Watchdeck.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.addEventListener('statechange', () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.info('[PWA] Nouvelle version prête.');
                }
              });
            }
          });
        })
        .catch((error) => console.warn('[PWA] Service worker non activé:', error));
    });
  }
}
