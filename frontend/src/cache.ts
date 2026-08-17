/**
 * Cache SWR (stale-while-revalidate) côté client, partagé par les vues principales.
 */

export interface CacheEntry<T = any> {
  savedAt: number;
  data: T;
}

export interface ReadCacheOptions {
  maxAgeMs?: number;
}

export interface WriteCacheOptions {
  persist?: boolean;
}

const memory = new Map<string, CacheEntry>();
const STORAGE_PREFIX = 'watchdeck:swr:';
const OWNER_KEY = 'watchdeck:swr-owner';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Entrée brute du cache : `{ data, savedAt }`, ou `null` si absente/trop vieille.
 */
export function readCacheEntry<T = any>(key: string, { maxAgeMs = Infinity }: ReadCacheOptions = {}): CacheEntry<T> | null {
  let entry = memory.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    const raw = storage()?.getItem(STORAGE_PREFIX + key);
    if (raw) {
      try {
        entry = JSON.parse(raw);
        if (entry) memory.set(key, entry);
      } catch {
        dropCache(key);
      }
    }
  }
  if (!entry || typeof entry.savedAt !== 'number') return null;
  if (Date.now() - entry.savedAt > maxAgeMs) {
    dropCache(key);
    return null;
  }
  return entry;
}

/** Charge utile seule — raccourci quand l'âge d'origine n'a pas besoin d'être affiché. */
export function readCache<T = any>(key: string, options?: ReadCacheOptions): T | null {
  return readCacheEntry<T>(key, options)?.data ?? null;
}

export function writeCache<T = any>(key: string, data: T, { persist = true }: WriteCacheOptions = {}): void {
  const entry: CacheEntry<T> = { savedAt: Date.now(), data };
  memory.set(key, entry);
  if (!persist) return;
  try {
    storage()?.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota dépassé ou stockage indisponible
  }
}

export function dropCache(key: string): void {
  memory.delete(key);
  try {
    storage()?.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* Stockage indisponible. */
  }
}

/** Vide tout le cache — déconnexion, ou changement de compte détecté. */
export function clearCache(): void {
  memory.clear();
  const store = storage();
  if (!store) return;
  try {
    for (const key of Object.keys(store)) {
      if (key.startsWith(STORAGE_PREFIX)) store.removeItem(key);
    }
  } catch {
    /* Stockage indisponible. */
  }
}

/**
 * Purge le cache si l'utilisateur connecté n'est plus celui pour qui il a été rempli.
 */
export function syncCacheOwner(session?: { id?: any; plex_user_id?: any; username?: any } | null): void {
  const owner = session ? String(session.id ?? session.plex_user_id ?? session.username ?? '') : '';
  const store = storage();
  let previous: string | null = null;
  try {
    previous = store?.getItem(OWNER_KEY) ?? null;
  } catch {
    return;
  }
  if (previous !== null && previous !== owner) clearCache();
  try {
    if (owner) store?.setItem(OWNER_KEY, owner);
    else store?.removeItem(OWNER_KEY);
  } catch {
    /* Stockage indisponible. */
  }
}
