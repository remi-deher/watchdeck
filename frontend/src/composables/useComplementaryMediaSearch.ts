import { computed, type Ref } from 'vue';
import { refDebounced } from '@vueuse/core';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import type { MediaRef } from '@/types';

/** Les deux sources échouent indépendamment ; la saisie identifie chaque requête. */
export function useComplementaryMediaSearch(query: Ref<string>, open: Ref<boolean>) {
  const needle = computed(() => query.value.trim());
  const delayed = refDebounced(needle, 250);
  function source(key: string, url: (value: string) => string) {
    const request = useQuery({
      queryKey: computed(() => ['search-results', key, delayed.value]),
      queryFn: ({ signal }) => api<MediaRef[] | { items: MediaRef[] }>(url(delayed.value), { signal }),
      select: (payload) => Array.isArray(payload) ? payload : payload.items ?? [],
      enabled: computed(() => open.value && delayed.value.length >= 2),
      retry: 0,
      staleTime: 60_000,
    });
    return {
      items: computed(() => needle.value === delayed.value && !request.isError.value ? request.data.value ?? [] : []),
      loading: computed(() => needle.value.length >= 2 && (needle.value !== delayed.value || request.isFetching.value)),
      error: computed(() => request.isError.value ? 'Cette source est momentanément indisponible.' : ''),
      retry: () => request.refetch(),
    };
  }
  return {
    library: source('library', value => `/api/library?query=${encodeURIComponent(value)}&limit=6`),
    discover: source('discover', value => `/api/discover/search?query=${encodeURIComponent(value)}&media_type=all`),
  };
}
