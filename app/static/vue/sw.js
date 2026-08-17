/**
 * Service Worker pour Watchdeck PWA.
 * 
 * Stratégies :
 * - Cache Stale-While-Revalidate pour les assets statiques (/vue/assets/*, icônes, polices).
 * - Réseau direct (Network-only) pour toutes les API (/api/*, /login, /logout, /webhook/*, /api/events).
 * - Network-First avec repli cache pour la navigation HTML.
 */

const CACHE_NAME = 'watchdeck-cache-v3';
const STATIC_ASSETS = [
  '/vue/icon.svg',
  '/vue/icon-192.png',
  '/vue/icon-512.png',
  '/vue/icon-maskable-512.png',
  '/vue/apple-touch-icon.png',
  '/vue/favicon.png',
  '/vue/manifest.webmanifest',
];

// Installation : mise en cache des assets essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[PWA SW] Pre-caching non-bloquant:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Interception des requêtes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignorer les requêtes non-GET et les requêtes tierces (sauf fonts.gstatic.com / fonts.googleapis.com)
  if (request.method !== 'GET') return;

  // 2. Toujours contourner le cache pour l'API, l'authentification et les webhooks
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/logout') ||
    url.pathname.startsWith('/webhook') ||
    url.pathname.startsWith('/setup') ||
    url.pathname.includes('/events')
  ) {
    return;
  }

  // 3. Les chunks Vite hashés restent sous le contrôle du cache HTTP immutable.
  // Les conserver aussi dans le SW crée des assemblages de versions incomplets après
  // un déploiement, en particulier avec le cache agressif de Safari iOS.
  if (url.pathname.startsWith('/vue/assets/')) return;

  // 4. Cache-First limité aux ressources stables non générées par Vite.
  if (
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2') ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'fonts.googleapis.com'
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 5. Navigation HTML (pages) : Network-First
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedIndex = await cache.match('/vue/index.html') || await cache.match('/');
        return cachedIndex || Response.error();
      })
    );
  }
});
