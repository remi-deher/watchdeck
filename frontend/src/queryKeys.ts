/* Cles TanStack Query lues par plusieurs ecrans.
 *
 * Deux ecrans qui chargent la meme ressource doivent employer la meme cle : c'est ce
 * qui leur fait partager le cache, l'invalidation et le patch temps reel. Une cle
 * propre a un seul ecran reste ecrite sur place.
 *
 * La racine decide aussi de la conservation sur l'appareil (`offline/stockage`) :
 * `users`, `settings`, `playback`... n'y sont jamais ecrits.
 */
export const queryKeys = {
  me: {
    quota: ['me', 'quota'] as const,
  },
  users: {
    all: ['users'] as const,
    list: ['users', 'list'] as const,
  },
  playback: {
    live: ['playback', 'live'] as const,
  },
  downloads: {
    arrQueue: ['downloads', 'arr-queue'] as const,
    globalStats: (clientId: string | number | null | undefined) => ['downloads', 'global-stats', clientId ? String(clientId) : 'all'] as const,
  },
  diskSpace: ['disk-space'] as const,
  vff: {
    all: ['settings', 'vff'] as const,
    scanStatus: ['settings', 'vff', 'scan-status'] as const,
    syncStatus: ['settings', 'vff', 'sync-status'] as const,
    counts: ['settings', 'vff', 'counts'] as const,
    metrics: ['settings', 'vff', 'metrics'] as const,
  },
};
