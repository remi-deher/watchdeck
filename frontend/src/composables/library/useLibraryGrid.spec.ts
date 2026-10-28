import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, nextTick, ref, unref } from 'vue';
import { useLibraryGrid } from './useLibraryGrid';

const state = vi.hoisted(() => ({ data: null as any }));
vi.mock('@tanstack/vue-query', async () => {
  const { ref } = await import('vue');
  return {
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    useQuery: () => ({ data: ref(undefined), isFetching: ref(false), refetch: vi.fn() }),
    useInfiniteQuery: () => ({ data: state.data, hasNextPage: ref(true), isFetching: ref(false), isFetchingNextPage: ref(false), refetch: vi.fn(), fetchNextPage: vi.fn() }),
  };
});
vi.mock('@/cache', () => ({ readCache: vi.fn(), writeCache: vi.fn() }));

beforeEach(() => { state.data = ref(undefined); vi.stubGlobal('matchMedia', () => ({ matches: false })); });

afterEach(() => vi.unstubAllGlobals());

describe('incremental library projections', () => {
  it('retains existing cards on append, refreshes changed media and resets on filter change', async () => {
    const filters: any = Object.fromEntries([
      ...['statusFilters', 'typeFilters', 'sourceFilters', 'requesterFilters'].map(key => [key, ref([])]),
      ...['query', 'vf', 'subtitle', 'decade', 'sort', 'genre', 'audioFormat', 'releaseType', 'hiRes', 'plexServer'].map(key => [key, ref('')]),
    ]);
    filters.values = () => Object.fromEntries(Object.entries(filters).filter(([key]) => key !== 'values').map(([key, value]) => [key, unref(value)]));
    const scope = effectScope();
    const grid = scope.run(() => useLibraryGrid({ filters, activeHub: ref(null) as any, hubLoading: computed(() => false), refreshActiveHub: async () => {}, error: ref('') }))!;
    try {
      await grid.load();
      state.data.value = { pages: [{ items: [{ id: 1, title: 'First' }, { id: 2, title: 'Second' }] }] };
      await nextTick();
      const first = grid.items.value[0], second = grid.items.value[1];
      state.data.value = { pages: [...state.data.value.pages, { items: [{ id: 2, title: 'Duplicate' }, { id: 3, title: 'Third' }] }] };
      await nextTick();
      expect(grid.items.value.map(item => item.id)).toEqual([1, 2, 3]);
      expect(grid.items.value[0]).toBe(first);
      expect(grid.items.value[1]).toBe(second);
      state.data.value = { pages: [{ items: [{ id: 1, title: 'Updated' }, state.data.value.pages[0].items[1]] }] };
      await nextTick();
      expect(grid.items.value.map(item => item.title)).toEqual(['Updated', 'Second']);
      expect(grid.items.value[1]).toBe(second);
      filters.query.value = 'Other';
      await grid.load();
      state.data.value = { pages: [{ items: [{ id: 4, title: 'Other' }] }] };
      await nextTick();
      expect(grid.items.value.map(item => item.id)).toEqual([4]);
    } finally { scope.stop(); }
  });
});
