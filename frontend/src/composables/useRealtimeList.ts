import type { Ref } from 'vue';
import { useRealtime, type RealtimeEventType } from '@/events';
import { useInPlaceList } from './useInPlaceList';

export interface UseRealtimeListOptions<T = any> {
  keyFields?: string[];
  onFallbackReload?: (() => void) | null;
  patchAllMatches?: boolean;
  mapper?: ((payload: any) => any) | null;
  debounceMs?: number;
  refreshOnVisible?: boolean;
}

export function useRealtimeList<T = any>(
  listRef: Ref<T[]> | T[],
  eventTypes: RealtimeEventType[] | string[] = ['request.updated'],
  options: UseRealtimeListOptions<T> = {}
) {
  const {
    keyFields = ['id', 'request_id', 'tmdb_id', 'tvdb_id'],
    onFallbackReload = null,
    patchAllMatches = false,
    mapper = null,
    debounceMs = 120,
    refreshOnVisible = true,
  } = options;

  const { matchItem, patchItem, removeItem } = useInPlaceList();

  useRealtime(
    eventTypes,
    (_type, detail) => {
      const payload = detail?.payload || detail;
      if (!payload) {
        if (onFallbackReload) onFallbackReload();
        return;
      }

      const data = mapper ? mapper(payload) : payload;

      const arr: T[] = (listRef as Ref<T[]>).value || (listRef as T[]);
      if (patchAllMatches && Array.isArray(arr)) {
        let patchedAny = false;
        for (const item of arr) {
          if (matchItem(item, data, keyFields)) {
            Object.keys(data).forEach((k) => {
              if (data[k] !== undefined && k !== 'action') {
                (item as any)[k] = data[k];
              }
            });
            patchedAny = true;
          }
        }
        if (!patchedAny && onFallbackReload) {
          onFallbackReload();
        }
        return;
      }

      const patched = patchItem(listRef, data, { keyFields });
      if (!patched && onFallbackReload) {
        onFallbackReload();
      }
    },
    { debounceMs, refreshOnVisible }
  );

  return {
    matchItem,
    patchItem,
    removeItem,
  };
}
