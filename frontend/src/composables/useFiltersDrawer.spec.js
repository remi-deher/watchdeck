import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useFiltersDrawer } from './useFiltersDrawer';

describe('useFiltersDrawer', () => {
  it('initialise avec filtersOpen fermé et activeCount à 0 quand les filtres sont par défaut', () => {
    const search = ref('');
    const type = ref('all');
    const tags = ref([]);

    const { filtersOpen, activeCount, toggle, close, reset } = useFiltersDrawer(
      { search, type, tags },
      { search: '', type: 'all', tags: [] }
    );

    expect(filtersOpen.value).toBe(false);
    expect(activeCount.value).toBe(0);

    toggle();
    expect(filtersOpen.value).toBe(true);

    close();
    expect(filtersOpen.value).toBe(false);
  });

  it('calcule activeCount correctement et réinitialise les filtres', () => {
    const search = ref('test');
    const type = ref('movie');
    const tags = ref(['tag1']);

    const { activeCount, reset } = useFiltersDrawer(
      { search, type, tags },
      { search: '', type: 'all', tags: [] }
    );

    expect(activeCount.value).toBe(3);

    search.value = '';
    expect(activeCount.value).toBe(2);

    reset();
    expect(search.value).toBe('');
    expect(type.value).toBe('all');
    expect(tags.value).toEqual([]);
    expect(activeCount.value).toBe(0);
  });

  it('supporte activeCountFn et onReset optionnels', () => {
    const search = ref('custom');
    let resetCalled = false;

    const { activeCount, reset } = useFiltersDrawer(
      { search },
      { search: '' },
      {
        activeCountFn: () => 42,
        onReset: () => { resetCalled = true; },
      }
    );

    expect(activeCount.value).toBe(42);
    reset();
    expect(resetCalled).toBe(true);
    expect(search.value).toBe('');
  });
});
