import { ref, type Ref } from 'vue';
import { api } from '@/api';
import { proxyUrl } from '@/utils/mediaImage';

const asLibraryItems = (rows: any[]): any[] => rows.map((row) => ({ ...row, _kind: 'library' }));
const asRequestItems = (payload: { items?: any[] }): any[] =>
  (payload.items || []).map((row) => ({
    ...row,
    _kind: 'request',
    poster_url: proxyUrl(row.poster_url),
  }));

export interface UseLibraryHubsDeps {
  isAbort: (error: any) => boolean;
  onError: (msg: string) => void;
}

export function useLibraryHubs({ isAbort, onError }: UseLibraryHubsDeps) {
  const music = {
    recent: ref<any[]>([]),
    artists: ref<any[]>([]),
    albums: ref<any[]>([]),
    tracks: ref<any[]>([]),
    loading: ref(false),
  };
  const all = {
    recent: ref<any[]>([]),
    movies: ref<any[]>([]),
    shows: ref<any[]>([]),
    music: ref<any[]>([]),
    requests: ref<any[]>([]),
    loading: ref(false),
  };
  const type = {
    recent: ref<any[]>([]),
    requests: ref<any[]>([]),
    genreRows: ref<Array<{ genre: string; items: any[] }>>([]),
    loading: ref(false),
  };

  async function run(loadingRef: Ref<boolean>, work: () => Promise<void>): Promise<void> {
    loadingRef.value = true;
    try {
      await work();
    } catch (error: any) {
      if (!isAbort(error)) onError(error.message);
    } finally {
      loadingRef.value = false;
    }
  }

  function loadMusicHub(options?: RequestInit): Promise<void> {
    return run(music.loading, async () => {
      const [recent, artists, albums, tracks] = await Promise.all([
        api<any[]>('/api/library?media_types=artist,album,track&limit=10&offset=0', options),
        api<any[]>('/api/library?media_types=artist&limit=10&offset=0', options),
        api<any[]>('/api/library?media_types=album&limit=10&offset=0', options),
        api<any[]>('/api/library?media_types=track&limit=10&offset=0', options),
      ]);
      music.recent.value = asLibraryItems(recent);
      music.artists.value = asLibraryItems(artists);
      music.albums.value = asLibraryItems(albums);
      music.tracks.value = asLibraryItems(tracks);
    });
  }

  function loadAllHub(options?: RequestInit): Promise<void> {
    return run(all.loading, async () => {
      const [recent, movies, shows, musicRows, requests] = await Promise.all([
        api<any[]>('/api/library?limit=10&offset=0&sort=added_desc', options),
        api<any[]>('/api/library?media_types=movie&limit=10&offset=0', options),
        api<any[]>('/api/library?media_types=show&limit=10&offset=0', options),
        api<any[]>('/api/library?media_types=artist,album,track&limit=10&offset=0', options),
        api<{ items?: any[] }>('/api/requests-list?limit=10', options),
      ]);
      all.recent.value = asLibraryItems(recent);
      all.movies.value = asLibraryItems(movies);
      all.shows.value = asLibraryItems(shows);
      all.music.value = asLibraryItems(musicRows);
      all.requests.value = asRequestItems(requests);
    });
  }

  function loadTypeHub(mediaType: string, options?: RequestInit): Promise<void> {
    return run(type.loading, async () => {
      const [recent, requests, genres] = await Promise.all([
        api<any[]>(`/api/library?media_types=${mediaType}&limit=10&offset=0`, options),
        api<{ items?: any[] }>(`/api/requests-list?media_types=${mediaType}&limit=10`, options),
        api<Array<{ genre: string }>>(`/api/library-genres?media_type=${mediaType}&limit=4`, options).catch(() => []),
      ]);
      type.recent.value = asLibraryItems(recent);
      type.requests.value = asRequestItems(requests);

      const rows = await Promise.all(
        genres.map((entry) =>
          api<any[]>(
            `/api/library?media_types=${mediaType}&genre=${encodeURIComponent(entry.genre)}&limit=10`,
            options
          ).catch(() => [])
        )
      );
      type.genreRows.value = genres.map((entry, index) => ({
        genre: entry.genre,
        items: asLibraryItems(rows[index]),
      }));
    });
  }

  return { music, all, type, loadMusicHub, loadAllHub, loadTypeHub };
}
