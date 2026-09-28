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
  users: {
    all: ['users'] as const,
    list: ['users', 'list'] as const,
  },
};
