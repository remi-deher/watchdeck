/* Annulation de la requete precedente, quand TanStack Query ne peut pas s'en charger.
 *
 * Les lectures paginees ou filtrees sont passees a `useQuery`/`useInfiniteQuery` : la cle
 * y annule la lecture devenue obsolete. Trois ecrans gardent ce composable parce que leur
 * liste est modifiee en place apres coup -- `useRealtimeList` dans MyRequestsPanel,
 * `useDirectMediaRequest` dans DiscoverView, le chargement priorise par hub de
 * LibraryView. Muter des donnees detenues par le cache de TanStack Query est interdit :
 * ces trois ecrans ne pourront migrer qu'avec les composables temps reel correspondants,
 * hors du perimetre de ce lot.
 */
import { onUnmounted } from 'vue';

export interface LatestRequestContext {
  signal: AbortSignal;
  isCurrent: () => boolean;
}

export function useLatestRequest() {
  let controller: AbortController | null = null;
  let sequence = 0;

  function token(): () => boolean {
    const mine = ++sequence;
    return () => mine === sequence;
  }

  function begin(): LatestRequestContext {
    controller?.abort();
    controller = new AbortController();
    return { signal: controller.signal, isCurrent: token() };
  }

  function extend(): LatestRequestContext {
    controller ||= new AbortController();
    return { signal: controller.signal, isCurrent: token() };
  }

  function abort(): void {
    controller?.abort();
  }

  const isAbort = (error: any): boolean => error?.name === 'AbortError';

  onUnmounted(abort);

  return { begin, extend, abort, isAbort };
}
