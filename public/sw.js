/**
 * Service Worker pour Watchdeck PWA.
 * 
 * Stratégies :
 * - Cache Stale-While-Revalidate pour les assets statiques (/vue/assets/*, icônes, polices).
 * - Réseau direct (Network-only) pour toutes les API (/api/*, /login, /logout, /webhook/*, /api/events).
 * - Network-First avec repli cache pour la navigation HTML (coquille de l'app, hors ligne).
 * - Affiches (/api/image-proxy) : cache d'abord, revalidation au-dela de 24 h.
 */

const CACHE_NAME = 'watchdeck-cache-v3';
/* Meme nom que CACHE_AFFICHES (frontend/src/offline/stockage.ts), qui l'efface a la
   deconnexion : les affiches passent par un proxy authentifie. */
const CACHE_AFFICHES = 'watchdeck-images-v1';
const AFFICHES_MAX = 600;
const AFFICHES_FRAICHEUR_MS = 24 * 60 * 60 * 1000;
const COQUILLE = '/__app-shell';
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
        keys.filter((key) => key !== CACHE_NAME && key !== CACHE_AFFICHES).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// The first document was loaded before this worker controlled the page. Prime
// its shell explicitly so first-visit offline reopening does not need a second navigation.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'WATCHDECK_CACHE_SHELL' || !event.source?.url) return;
  const url = new URL(event.data.url, self.location.origin);
  if (new URL(event.source.url).origin !== self.location.origin || url.origin !== self.location.origin ||
      /^\/(api|login|logout|setup|privacy|webhook)(?:\/|$)/.test(url.pathname)) return;
  event.waitUntil(fetch(url.href, { credentials: 'same-origin' }).then(async (response) => {
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html') ||
        (response.redirected && /\/(login|setup)(?:[/?]|$)/.test(response.url))) return;
    await (await caches.open(CACHE_NAME)).put(COQUILLE, response.clone());
  }).catch(() => {}));
});

// Interception des requêtes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Laisser les ressources tierces au navigateur : leur chargement utilise
  // style-src/font-src, tandis qu'un fetch du SW serait soumis à connect-src.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 2. Affiches : une adresse donnee designe toujours la meme image. Servie depuis le
  //    cache, elle s'affiche des la premiere image -- au lancement comme hors ligne --
  //    au lieu d'un rectangle gris le temps d'un aller-retour. Au-dela de 24 h, elle est
  //    rafraichie en arriere-plan.
  if (url.origin === self.location.origin && (url.pathname === '/api/image-proxy' || url.pathname === '/api/playback/thumb')) {
    event.respondWith(servirAffiche(event, request));
    return;
  }

  // 3. Toujours contourner le cache pour l'API, l'authentification et les webhooks
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

  // 4. Les chunks Vite hashés restent sous le contrôle du cache HTTP immutable.
  // Les conserver aussi dans le SW crée des assemblages de versions incomplets après
  // un déploiement, en particulier avec le cache agressif de Safari iOS.
  if (url.pathname.startsWith('/vue/assets/')) return;

  // 5. Cache-First limité aux ressources stables non générées par Vite.
  if (
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
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
          .catch(() => cachedResponse || Response.error());

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 6. Navigation HTML (pages) : Network-First. La derniere page recue est gardee comme
  //    coquille : hors ligne, l'application s'ouvre quand meme, sur ses donnees conservees.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((reponse) => {
          if (reponse.ok && (reponse.headers.get('content-type') || '').includes('text/html')) {
            const copie = reponse.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(COQUILLE, copie)));
          }
          return reponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const coquille = await cache.match(COQUILLE) || await cache.match('/vue/index.html') || await cache.match('/');
          return coquille || Response.error();
        })
    );
  }
});

async function servirAffiche(event, request) {
  const cache = await caches.open(CACHE_AFFICHES);
  const enCache = await cache.match(request);
  const rafraichir = () => fetch(request).then(async (reponse) => {
    const type = reponse.headers.get('content-type') || '';
    if (reponse.status === 200 && type.startsWith('image/')) {
      // La date de mise en cache voyage dans un en-tete : c'est elle qui dit l'age.
      const entetes = new Headers(reponse.headers);
      entetes.set('sw-cached-at', String(Date.now()));
      const corps = await reponse.clone().blob();
      await conserverAffiche(cache, request, new Response(corps, { status: 200, headers: entetes })).catch(() => {});
    }
    return reponse;
  });
  if (enCache) {
    const age = Date.now() - Number(enCache.headers.get('sw-cached-at') || 0);
    if (age > AFFICHES_FRAICHEUR_MS) event.waitUntil(rafraichir().catch(() => {}));
    return enCache;
  }
  return rafraichir().catch(() => Response.error());
}

/* Serialiser les seules ecritures (les telechargements restent paralleles). Une
   lecture complete toutes les 32 ecritures remplace le scan apres chaque image.
   Les Request conservees respectent Vary ; une revalidation ne compte pas double.
   Apres une purge externe, cet index peut surestimer la taille, jamais la depasser. */
let ecritureAffiches = Promise.resolve();
let clesAffiches = null;
let ecrituresDepuisScan = 0;
function conserverAffiche(cache, request, reponse) {
  const travail = ecritureAffiches.catch(() => {}).then(async () => {
    if (!clesAffiches || ecrituresDepuisScan >= 32) {
      clesAffiches = await cache.keys();
      ecrituresDepuisScan = 0;
      while (clesAffiches.length > AFFICHES_MAX) await cache.delete(clesAffiches.shift());
    }
    const existe = await cache.match(request);
    if (!existe) {
      // Evincer AVANT l'insertion conserve le plafond, meme pendant une rafale.
      while (clesAffiches.length >= AFFICHES_MAX) await cache.delete(clesAffiches.shift());
    }
    await cache.put(request, reponse);
    if (!existe) clesAffiches.push(request);
    ecrituresDepuisScan += 1;
  });
  ecritureAffiches = travail;
  return travail;
}
