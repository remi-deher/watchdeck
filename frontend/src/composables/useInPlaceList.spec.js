import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useInPlaceList } from './useInPlaceList';

describe('useInPlaceList', () => {
  it('updates matching item in place without replacing array instance', () => {
    const { patchItem } = useInPlaceList();
    const list = ref([
      { id: 1, title: 'Film 1', status: 'pending' },
      { id: 2, title: 'Film 2', status: 'pending' },
    ]);

    const patched = patchItem(list, { id: 1, status: 'available' });
    expect(patched).toBe(true);
    expect(list.value[0].status).toBe('available');
    expect(list.value[0].title).toBe('Film 1');
    expect(list.value[1].status).toBe('pending');
  });

  it('inserts new item when autoInsert is true or action is created', () => {
    const { patchItem } = useInPlaceList();
    const list = ref([
      { id: 1, title: 'Film 1', status: 'pending' },
    ]);

    patchItem(list, { id: 3, title: 'Film 3', status: 'pending', action: 'created' });
    expect(list.value.length).toBe(2);
    expect(list.value[0].id).toBe(3);
  });

  it('removes item by key', () => {
    const { removeItem } = useInPlaceList();
    const list = ref([
      { id: 1, title: 'Film 1' },
      { id: 2, title: 'Film 2' },
    ]);

    removeItem(list, 1, 'id');
    expect(list.value.length).toBe(1);
    expect(list.value[0].id).toBe(2);
  });
});
