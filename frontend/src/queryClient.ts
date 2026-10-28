import { installCacheBudgets } from '@/queryBudgets';

import { QueryClient } from '@tanstack/vue-query';

export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        /* Aussi longtemps que le stockage local (`offline/stockage`) : une donnee retiree
           de la memoire cesserait aussi d'etre conservee sur l'appareil. */
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
  installCacheBudgets(client);
  return client;
}


export function shouldRetry(attempt: number, error: any): boolean {
  if (attempt >= 2 || ['AbortError', 'CancelledError'].includes(error?.name)) return false;
  if (error?.name === 'TimeoutError') return attempt < 1;
  if (typeof error?.status === 'number') {
    return [408, 425, 429, 500, 502, 503, 504].includes(error.status) && (error.retryAfterMs ?? 0) <= 30_000;
  }
  return true;
}
export function retryDelay(attempt: number, error: any): number {
  return Math.max(Math.min(1000 * 2 ** attempt, 10_000), error?.retryAfterMs ?? 0);
}
