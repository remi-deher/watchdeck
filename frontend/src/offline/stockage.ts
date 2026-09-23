import { createStore, del, get, set } from 'idb-keyval';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import type { Query, QueryClient } from '@tanstack/vue-query';
import { clearCache } from '@/cache';

/**
 * Stockage local : l'application s'ouvre sur ce qu'elle savait deja.
 *
 * iOS decharge volontiers une application installee de la memoire. Chaque retour
 * repartait alors de zero : grilles vides, affiches grises, le temps que tout revienne
 * du serveur. Le cache des donnees (TanStack Query) est donc conserve dans IndexedDB
 * pendant 24 heures ; au lancement, les pages s'affichent aussitot avec ces donnees,
 * puis se rafraichissent en arriere-plan. Sans reseau, elles restent consultables.
 *
 * Deux garde-fous :
 * - seules des donnees de consultation sont ecrites sur l'appareil (liste blanche) --
 *   jamais les reglages, qui contiennent des cles d'API, ni les comptes ou les journaux ;
 * - le stockage appartient a un compte : a la deconnexion, ou si un autre compte se
 *   connecte, tout est efface, affiches comprises.
 */

export const DUREE_CONSERVATION_MS = 24 * 60 * 60 * 1000;

/** Racines de cle dont les donnees peuvent vivre sur l'appareil. */
const RACINES_CONSERVEES = new Set([
  'library', 'library-analytics', 'discover', 'requests', 'calendar', 'media', 'issues', 'notifications',
]);

/** Le cache des affiches, tenu par le service worker (`public/sw.js`). */
export const CACHE_AFFICHES = 'watchdeck-images-v1';

const CLE_PROPRIETAIRE = 'watchdeck:stockage-proprietaire';
/** Change a chaque evolution incompatible de la forme des donnees conservees. */
const VERSION = '1';

const magasin = typeof indexedDB !== 'undefined' ? createStore('watchdeck', 'cache') : null;

function proprietaireEnregistre(): string {
  try {
    return localStorage.getItem(CLE_PROPRIETAIRE) || '';
  } catch {
    return '';
  }
}

export function conserverRequete(query: Query): boolean {
  if (query.state.status !== 'success') return false;
  const racine = Array.isArray(query.queryKey) ? query.queryKey[0] : null;
  return typeof racine === 'string' && RACINES_CONSERVEES.has(racine);
}

function persisteur(proprietaire: string) {
  return createAsyncStoragePersister({
    key: `watchdeck-requetes:${proprietaire || 'anonyme'}`,
    throttleTime: 1500,
    storage: magasin
      ? {
          getItem: (cle: string) => get<string>(cle, magasin).then((v) => v ?? null),
          setItem: (cle: string, valeur: string) => set(cle, valeur, magasin),
          removeItem: (cle: string) => del(cle, magasin),
        }
      : undefined,
  });
}

let persisteurCourant: ReturnType<typeof persisteur> | null = null;
let desabonner: (() => void) | null = null;

function abonner(client: QueryClient, proprietaire: string): Promise<void> {
  desabonner?.();
  persisteurCourant = persisteur(proprietaire);
  const [fin, restauration] = persistQueryClient({
    queryClient: client as any,
    persister: persisteurCourant,
    maxAge: DUREE_CONSERVATION_MS,
    buster: VERSION,
    dehydrateOptions: { shouldDehydrateQuery: conserverRequete as any },
  });
  desabonner = fin;
  return restauration;
}

/**
 * A passer a `VueQueryPlugin` (`clientPersister`) : restaure le cache du dernier compte
 * connu avant le montage, puis le tient a jour. Le compte n'est connu qu'apres
 * `/api/session` -- `synchroniserProprietaire` corrige ensuite s'il a change.
 */
export function brancherStockage(client: QueryClient): [() => void, Promise<void>] {
  const restauration = abonner(client, proprietaireEnregistre());
  return [() => desabonner?.(), restauration];
}

/** Efface tout ce que l'application a conserve sur l'appareil. */
export async function effacerStockage(client?: QueryClient | null): Promise<void> {
  client?.clear();
  clearCache();
  const taches: Promise<unknown>[] = [];
  if (persisteurCourant) taches.push(Promise.resolve(persisteurCourant.removeClient()));
  if (magasin) {
    taches.push(
      import('idb-keyval').then(({ keys, delMany }) =>
        keys(magasin).then((toutes) => delMany(toutes.filter((k) => String(k).startsWith('watchdeck-requetes:')), magasin))),
    );
  }
  if (typeof caches !== 'undefined') taches.push(caches.delete(CACHE_AFFICHES));
  await Promise.allSettled(taches);
}

/**
 * Le stockage est-il bien celui du compte connecte ? Sinon -- deconnexion, changement
 * de compte -- il est efface : les donnees d'un compte ne s'affichent jamais pour un
 * autre, meme un instant de plus que necessaire.
 */
export async function synchroniserProprietaire(
  client: QueryClient,
  session: { id?: unknown; plex_user_id?: unknown; username?: unknown } | null,
): Promise<void> {
  // Un compte sans identifiant exploitable (connexion locale) reste un compte : on ne le
  // confond pas avec une deconnexion.
  const proprietaire = session ? String(session.id ?? session.plex_user_id ?? session.username ?? '') || 'compte' : '';
  const precedent = proprietaireEnregistre();
  if (precedent === proprietaire) return;
  await effacerStockage(precedent ? client : null);
  try {
    if (proprietaire) localStorage.setItem(CLE_PROPRIETAIRE, proprietaire);
    else localStorage.removeItem(CLE_PROPRIETAIRE);
  } catch {
    /* Stockage indisponible : on retombe sur un cache en memoire seule. */
  }
  // Les ecritures suivantes vont dans le compartiment du nouveau compte -- ou nulle part.
  if (proprietaire) void abonner(client, proprietaire);
  else { desabonner?.(); desabonner = null; persisteurCourant = null; }
}
