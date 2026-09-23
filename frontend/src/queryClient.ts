import { QueryClient } from '@tanstack/vue-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        /* Aussi longtemps que le stockage local (`offline/stockage`) : une donnee retiree
           de la memoire cesserait aussi d'etre conservee sur l'appareil. */
        gcTime: 24 * 60 * 60_000,
        retry: 2,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
