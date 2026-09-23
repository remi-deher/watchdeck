import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { proxyUrl } from '@/utils/mediaImage';

const asLibraryItems = (rows: any[] = []): any[] => rows.map((row) => ({ ...row, _kind: 'library' }));
const asRequestItems = (payload: { items?: any[] } = {}): any[] =>
  (payload.items || []).map((row) => ({
    ...row,
    _kind: 'request',
    poster_url: proxyUrl(row.poster_url),
  }));

export type LibraryHub = 'all' | 'music' | 'type' | null;

export interface UseLibraryHubsDeps {
  /** Hub affiche ; seul celui-ci est lu. */
  activeHub: MaybeRefOrGetter<LibraryHub>;
  /** Type du hub « type » (film ou serie). */
  hubMediaType: MaybeRefOrGetter<string>;
  onError: (msg: string) => void;
}

const HUB_STALE_MS = 30_000;

/**
 * Hubs de la mediatheque (« Tout », Musique, Films / Series) : quelques rangees de dix
 * elements a la place de la grille paginee.
 *
 * Chaque hub est une query : il n'est lu que lorsqu'il est affiche, un retour sur un
 * hub deja vu repeint aussitot sa derniere version, et quitter un hub annule sa lecture
 * en cours (ce que faisait `useLatestRequest` a la main).
 */
export function useLibraryHubs({ activeHub, hubMediaType, onError }: UseLibraryHubsDeps) {
  const musicQuery = useQuery({
    queryKey: ['library', 'hub', 'music'],
    queryFn: async ({ signal }) => {
      const [recent, artists, albums, tracks] = await Promise.all([
        api<any[]>('/api/library?media_types=artist,album,track&limit=10&offset=0', { signal }),
        api<any[]>('/api/library?media_types=artist&limit=10&offset=0', { signal }),
        api<any[]>('/api/library?media_types=album&limit=10&offset=0', { signal }),
        api<any[]>('/api/library?media_types=track&limit=10&offset=0', { signal }),
      ]);
      return { recent: asLibraryItems(recent), artists: asLibraryItems(artists), albums: asLibraryItems(albums), tracks: asLibraryItems(tracks) };
    },
    enabled: computed(() => toValue(activeHub) === 'music'),
    staleTime: HUB_STALE_MS,
  });

  const allQuery = useQuery({
    queryKey: ['library', 'hub', 'all'],
    queryFn: async ({ signal }) => {
      const [recent, movies, shows, musicRows, requests] = await Promise.all([
        api<any[]>('/api/library?limit=10&offset=0&sort=added_desc', { signal }),
        api<any[]>('/api/library?media_types=movie&limit=10&offset=0', { signal }),
        api<any[]>('/api/library?media_types=show&limit=10&offset=0', { signal }),
        api<any[]>('/api/library?media_types=artist,album,track&limit=10&offset=0', { signal }),
        api<{ items?: any[] }>('/api/requests-list?limit=10', { signal }),
      ]);
      return {
        recent: asLibraryItems(recent), movies: asLibraryItems(movies), shows: asLibraryItems(shows),
        music: asLibraryItems(musicRows), requests: asRequestItems(requests),
      };
    },
    enabled: computed(() => toValue(activeHub) === 'all'),
    staleTime: HUB_STALE_MS,
  });

  const typeQuery = useQuery({
    queryKey: computed(() => ['library', 'hub', 'type', toValue(hubMediaType)]),
    queryFn: async ({ signal }) => {
      const mediaType = toValue(hubMediaType);
      const [recent, requests, genres] = await Promise.all([
        api<any[]>(`/api/library?media_types=${mediaType}&limit=10&offset=0`, { signal }),
        api<{ items?: any[] }>(`/api/requests-list?media_types=${mediaType}&limit=10`, { signal }),
        api<Array<{ genre: string }>>(`/api/library-genres?media_type=${mediaType}&limit=4`, { signal }).catch(() => []),
      ]);
      const rows = await Promise.all(
        genres.map((entry) =>
          api<any[]>(`/api/library?media_types=${mediaType}&genre=${encodeURIComponent(entry.genre)}&limit=10`, { signal }).catch(() => []),
        ),
      );
      return {
        recent: asLibraryItems(recent),
        requests: asRequestItems(requests),
        genreRows: genres.map((entry, index) => ({ genre: entry.genre, items: asLibraryItems(rows[index]) })),
      };
    },
    enabled: computed(() => toValue(activeHub) === 'type' && Boolean(toValue(hubMediaType))),
    staleTime: HUB_STALE_MS,
  });

  // Une lecture annulee (hub quitte) n'est pas une erreur a montrer.
  for (const query of [musicQuery, allQuery, typeQuery]) {
    watch(query.error, (failure) => {
      if (failure && (failure as Error).name !== 'AbortError' && (failure as Error).name !== 'CancelledError') onError((failure as Error).message);
    });
  }

  const music = {
    recent: computed(() => musicQuery.data.value?.recent || []),
    artists: computed(() => musicQuery.data.value?.artists || []),
    albums: computed(() => musicQuery.data.value?.albums || []),
    tracks: computed(() => musicQuery.data.value?.tracks || []),
    loading: computed(() => musicQuery.isFetching.value),
  };
  const all = {
    recent: computed(() => allQuery.data.value?.recent || []),
    movies: computed(() => allQuery.data.value?.movies || []),
    shows: computed(() => allQuery.data.value?.shows || []),
    music: computed(() => allQuery.data.value?.music || []),
    requests: computed(() => allQuery.data.value?.requests || []),
    loading: computed(() => allQuery.isFetching.value),
  };
  const type = {
    recent: computed(() => typeQuery.data.value?.recent || []),
    requests: computed(() => typeQuery.data.value?.requests || []),
    genreRows: computed(() => typeQuery.data.value?.genreRows || []),
    loading: computed(() => typeQuery.isFetching.value),
  };

  /** Relit le hub affiche (action, evenement temps reel). Un hub pas encore charge se
   *  charge de lui-meme des qu'il devient actif. */
  async function refreshActiveHub(): Promise<void> {
    const hub = toValue(activeHub);
    const query = hub === 'music' ? musicQuery : hub === 'all' ? allQuery : hub === 'type' ? typeQuery : null;
    if (query?.data.value !== undefined) await query.refetch();
  }

  return { music, all, type, refreshActiveHub };
}
