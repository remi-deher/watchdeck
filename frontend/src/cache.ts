import { jsonBytes } from '@/queryBudgets';
export interface CacheEntry<T = any> { savedAt: number; data: T }
export interface ReadCacheOptions { maxAgeMs?: number }
export interface WriteCacheOptions { persist?: boolean }
export const SWR_LIMITS = { entries: 48, variants: 6, bytes: 4 * 1024 * 1024, entryBytes: 512 * 1024, storageBytes: 2 * 1024 * 1024, storageEntries: 24, age: 6 * 60 * 60_000 };
const memory = new Map<string, CacheEntry>();
const sizes = new Map<string, number>();
const PREFIX = 'watchdeck:swr:';
const OWNER_KEY = 'watchdeck:swr-owner';
let currentOwner: string | undefined;
function storage(): Storage | null { try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; } }
const domain = (key: string) => key.split(':')[0];
const mirrored = (key: string) => /^(library|discover|calendar|media|requests|activity|storage)(:|$)/.test(key);
function bound(): void {
  let bytes = [...sizes.values()].reduce((a,b) => a+b, 0);
  const counts = new Map<string, number>();
  for (const key of [...memory.keys()].reverse()) counts.set(domain(key), (counts.get(domain(key)) || 0) + 1);
  for (const key of [...memory.keys()]) {
    const root = domain(key);
    if (memory.size > SWR_LIMITS.entries || bytes > SWR_LIMITS.bytes || (counts.get(root) || 0) > SWR_LIMITS.variants) {
      bytes -= sizes.get(key) || 0; counts.set(root, (counts.get(root) || 0)-1); dropCache(key);
    }
  }
}
function boundStorage(): void {
  const store = storage(); if (!store) return;
  try {
    const entries = Object.keys(store).filter(k => k.startsWith(PREFIX)).map(key => {
      const raw = store.getItem(key) || '';
      try { const value = JSON.parse(raw); return { key, size: new TextEncoder().encode(raw).byteLength, time: value.savedAt || 0 }; }
      catch { return { key, size: Infinity, time: 0 }; }
    }).sort((a,b) => b.time - a.time);
    let bytes = 0, count = 0;
    for (const entry of entries) {
      if (Date.now() - entry.time > SWR_LIMITS.age || entry.size > SWR_LIMITS.entryBytes || count >= SWR_LIMITS.storageEntries || bytes + entry.size > SWR_LIMITS.storageBytes) store.removeItem(entry.key);
      else { bytes += entry.size; count++; }
    }
  } catch { /* Unavailable storage does not block rendering. */ }
}
export function readCacheEntry<T = any>(key: string, { maxAgeMs = SWR_LIMITS.age }: ReadCacheOptions = {}): CacheEntry<T> | null {
  let entry = memory.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    try { const raw = storage()?.getItem(PREFIX + key); if (raw) entry = JSON.parse(raw); } catch { dropCache(key); }
  }
  if (!entry || !Number.isFinite(entry.savedAt) || Date.now() - entry.savedAt > Math.min(maxAgeMs, SWR_LIMITS.age) || jsonBytes(entry) > SWR_LIMITS.entryBytes) { dropCache(key); return null; }
  memory.delete(key); memory.set(key, entry); sizes.set(key, jsonBytes(entry)); bound();
  // Migrate duplicate session snapshots into memory; IndexedDB owns durable query data.
  if (mirrored(key)) try { storage()?.removeItem(PREFIX + key); } catch { /* optional */ }
  return entry;
}
export function readCache<T = any>(key: string, options?: ReadCacheOptions): T | null { return readCacheEntry<T>(key, options)?.data ?? null; }
export function writeCache<T = any>(key: string, data: T, { persist = !mirrored(key) }: WriteCacheOptions = {}): void {
  const entry = { savedAt: Date.now(), data }, size = jsonBytes(entry);
  if (size > SWR_LIMITS.entryBytes) { dropCache(key); return; }
  memory.delete(key); memory.set(key, entry); sizes.set(key, size); bound();
  try {
    if (persist && memory.has(key)) storage()?.setItem(PREFIX + key, JSON.stringify(entry));
    else storage()?.removeItem(PREFIX + key);
  } catch { /* Quota or unavailable storage. */ }
  boundStorage();
}
export function dropCache(key: string): void { memory.delete(key); sizes.delete(key); try { storage()?.removeItem(PREFIX + key); } catch { /* optional */ } }
export function clearCache(): void {
  memory.clear(); sizes.clear(); const store = storage(); if (!store) return;
  try { for (const key of Object.keys(store)) if (key.startsWith(PREFIX)) store.removeItem(key); } catch { /* optional */ }
}
export function syncCacheOwner(session?: { id?: any; plex_user_id?: any; username?: any } | null): void {
  const owner = session ? String(session.id ?? session.plex_user_id ?? session.username ?? '') : '';
  let previous = currentOwner;
  try { previous ??= storage()?.getItem(OWNER_KEY) ?? undefined; } catch { /* Compare memory identity. */ }
  if (previous !== undefined && previous !== owner) clearCache();
  currentOwner = owner;
  try { if (owner) storage()?.setItem(OWNER_KEY, owner); else storage()?.removeItem(OWNER_KEY); } catch { /* optional */ }
}

// Also cap snapshots left by older browser bundles before the first new write.
boundStorage();
