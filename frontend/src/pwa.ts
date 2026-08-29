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
                  // App.vue affiche un toast "Recharger" a partir de cet evenement : sans lui,
                  // l'utilisateur restait indefiniment sur les assets perimes sans le savoir.
                  window.dispatchEvent(new CustomEvent('watchdeck:sw-update-available'));
                }
              });
            }
          });
        })
        .catch((error) => console.warn('[PWA] Service worker non activé:', error));
    });
  }
}
