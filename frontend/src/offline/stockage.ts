import { createStore, del, get, set, keys, delMany } from 'idb-keyval';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClientSubscribe } from '@tanstack/query-persist-client-core';
import { hydrate, type Query, type QueryClient } from '@tanstack/vue-query';
import { clearCache } from '@/cache';
import { CACHE_BUDGETS, OFFLINE_ROOTS, jsonBytes } from '@/queryBudgets';
import { loadSession } from '@/composables/useSession';
import { rememberSession } from '@/sessionCache';

const DAY = 24 * 60 * 60_000;
const OWNER_KEY = 'watchdeck:stockage-proprietaire';
const VERSION = '1';
const magasin = typeof indexedDB !== 'undefined' ? createStore('watchdeck', 'cache') : null;
let generation = 0;
let ownerEpoch = 0;
let currentOwner: string | undefined;
let desabonner: (() => void) | null = null;
let currentPersister: ReturnType<typeof createAsyncStoragePersister> | null = null;
const writes = new Set<Promise<unknown>>();
function savedOwner(): string {
  try { return localStorage.getItem(OWNER_KEY) || ''; } catch { return currentOwner || ''; }
}
export function conserverRequete(query: Query): boolean {
  return (query.state.status === 'success' || (query.state.status === 'error' && query.state.data !== undefined && query.state.dataUpdatedAt > 0)) && OFFLINE_ROOTS.has(String(query.queryKey[0]));
}

/** Bounds both old snapshots on restore and new snapshots before writing. */
export function boundedSnapshot(value: any): any {
  if (!value?.clientState) return value;
  let size = 0;
  const counts = new Map<string, number>();
  const selected: any[] = [];
  for (const query of [...(value.clientState.queries || [])].sort((a,b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)) {
    const root = String(query.queryKey?.[0]);
    if (!Number.isFinite(query.state.dataUpdatedAt) || !conserverRequete(query as any) || Date.now() - query.state.dataUpdatedAt > DAY) continue;
    if (selected.length >= CACHE_BUDGETS.persistedQueries || (counts.get(root) || 0) >= (root === 'media' ? 20 : 12)) continue;
    const normalized = query.state.status === 'error' ? { ...query, state: { ...query.state, status: 'success', error: null, fetchStatus: 'idle', fetchFailureCount: 0, fetchFailureReason: null, isInvalidated: true } } : query;
    const data = normalized.state.data;
    const entry = Array.isArray(data?.pages) && Array.isArray(data.pageParams) ? { ...normalized, state: { ...normalized.state, data: { ...data, pages: data.pages.slice(0, 3), pageParams: data.pageParams.slice(0, 3) } } } : normalized;
    const bytes = jsonBytes(entry);
    if (bytes > 1024 * 1024 || size + bytes > CACHE_BUDGETS.persistedBytes - 4096) continue;
    selected.push(entry); size += bytes; counts.set(root, (counts.get(root) || 0) + 1);
  }
  return { ...value, clientState: { mutations: [], queries: selected } };
}

async function abonner(client: QueryClient, owner: string): Promise<void> {
  desabonner?.();
  const epoch = ++generation;
  const active = () => generation === epoch && currentOwner === owner;
  const persister = createAsyncStoragePersister({
    key: `watchdeck-requetes:${owner}`, throttleTime: 1500,
    serialize: (value) => JSON.stringify(boundedSnapshot(value)),
    deserialize: (raw) => raw.length <= CACHE_BUDGETS.persistedBytes * 2 ? boundedSnapshot(JSON.parse(raw)) : undefined as any,
    storage: magasin ? {
      getItem: async (key: string) => { const raw = await get<string>(key, magasin); return active() ? raw ?? null : null; },
      setItem: (key: string, value: string) => {
        if (!active()) return Promise.resolve();
        const task = set(key, value, magasin); writes.add(task);
        return task.finally(() => writes.delete(task));
      },
      removeItem: (key: string) => del(key, magasin),
    } : undefined,
  });
  currentPersister = persister;
  let stored;
  try { stored = await persister.restoreClient(); } catch { /* Corrupt/offline storage: use memory. */ }
  if (!active()) return;
  if (stored?.buster === VERSION && Date.now() - stored.timestamp <= DAY) hydrate(client, boundedSnapshot(stored).clientState);
  if (!active()) return;
  desabonner = persistQueryClientSubscribe({ queryClient: client as any, persister, buster: VERSION,
    dehydrateOptions: { shouldDehydrateQuery: conserverRequete as any, shouldDehydrateMutation: () => false } });
}

/** Verify the session before hydrating another account's saved query data. */
export function brancherStockage(client: QueryClient): [() => void, Promise<void>] {
  if (typeof window !== 'undefined' && ['/login', '/setup', '/privacy'].includes(window.location.pathname.replace(/\/+$/, ''))) return [() => {}, Promise.resolve()];
  let stopped = false;
  const restauration = loadSession().then(async (session) => {
    if (stopped) return;
    await synchroniserProprietaire(client, session);
    if (!stopped && session && !currentPersister) await abonner(client, currentOwner || savedOwner());
  });
  return [() => { stopped = true; generation++; desabonner?.(); desabonner = null; }, restauration];
}

async function clearStored(client?: QueryClient | null): Promise<void> {
  generation++; desabonner?.(); desabonner = null;
  const previous = currentPersister; currentPersister = null;
  client?.clear(); clearCache(); rememberSession(null);
  currentOwner = undefined;
  try { localStorage.removeItem(OWNER_KEY); } catch { /* Memory only. */ }
  await Promise.allSettled([...writes]);
  const tasks: Promise<unknown>[] = [];
  if (previous) tasks.push(Promise.resolve(previous.removeClient()));
  if (magasin) tasks.push(keys(magasin).then((all) => delMany(all.filter(k => String(k).startsWith('watchdeck-requetes:')), magasin)));
  if (typeof caches !== 'undefined') tasks.push(caches.delete('watchdeck-images-v1'));
  await Promise.allSettled(tasks);
}

export async function effacerStockage(client?: QueryClient | null): Promise<void> {
  ownerEpoch++;
  await clearStored(client);
}

export async function synchroniserProprietaire(client: QueryClient, session: { id?: unknown; plex_user_id?: unknown; username?: unknown } | null): Promise<void> {
  const operation = ++ownerEpoch;
  const owner = session ? String(session.id ?? session.plex_user_id ?? session.username ?? '') || 'compte' : '';
  const previous = savedOwner() || currentOwner || '';
  if (previous === owner) { currentOwner = owner; return; }
  await clearStored(previous ? client : null);
  if (operation !== ownerEpoch) return;
  currentOwner = owner;
  try { if (owner) localStorage.setItem(OWNER_KEY, owner); else localStorage.removeItem(OWNER_KEY); } catch { /* Memory only. */ }
  if (session) rememberSession(session as any);
  if (owner) await abonner(client, owner);
}
