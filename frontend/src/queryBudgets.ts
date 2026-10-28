import type { QueryClient } from '@tanstack/vue-query';

export const OFFLINE_ROOTS = new Set(['library', 'library-analytics', 'discover', 'requests', 'calendar', 'media', 'issues', 'notifications']);
export const CACHE_BUDGETS = {
  maxBytes: 24 * 1024 * 1024, maxQueries: 120, perDomain: 24, detailVariants: 40,
  inactivePages: 3, persistedBytes: 8 * 1024 * 1024, persistedQueries: 60,
};
export function jsonBytes(value: unknown): number {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { return Infinity; }
}

/** Never remove data currently displayed; bound inactive variants and retained pages. */
export function enforceQueryBudgets(client: QueryClient): void {
  const queries = client.getQueryCache().getAll();
  for (const query of queries) {
    if (query.getObserversCount() || query.state.fetchStatus !== 'idle') continue;
    const data: any = query.state.data;
    if (Array.isArray(data?.pages) && Array.isArray(data.pageParams) && data.pages.length > CACHE_BUDGETS.inactivePages) {
      client.setQueryData(query.queryKey, { ...data, pages: data.pages.slice(0, 3), pageParams: data.pageParams.slice(0, 3) });
    }
  }
  const ordered = client.getQueryCache().getAll().sort((a,b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  const domains = new Map<string, number>();
  let bytes = 0, count = 0;
  for (const query of ordered) {
    const domain = String(query.queryKey[0]);
    const size = jsonBytes(query.state.data);
    const variants = domains.get(domain) || 0;
    const limit = domain === 'media' ? CACHE_BUDGETS.detailVariants : CACHE_BUDGETS.perDomain;
    const active = query.getObserversCount() > 0 || query.state.fetchStatus !== 'idle';
    if (!active && (variants >= limit || count >= CACHE_BUDGETS.maxQueries || bytes + size > CACHE_BUDGETS.maxBytes)) {
      client.removeQueries({ queryKey: query.queryKey, exact: true });
    } else { bytes += size; count++; domains.set(domain, variants + 1); }
  }
}
export function installCacheBudgets(client: QueryClient): void {
  for (const root of OFFLINE_ROOTS) client.setQueryDefaults([root], { gcTime: 24 * 60 * 60_000 });
  for (const root of ['downloads', 'playback', 'health', 'logs']) client.setQueryDefaults([root], { gcTime: 60_000 });
  let queued = false, enforcing = false;
  client.getQueryCache().subscribe((event) => {
    if (enforcing || queued || !['updated', 'observerRemoved'].includes(event.type)) return;
    queued = true;
    queueMicrotask(() => {
      queued = false; enforcing = true;
      try { enforceQueryBudgets(client); } finally { enforcing = false; }
    });
  });
}
