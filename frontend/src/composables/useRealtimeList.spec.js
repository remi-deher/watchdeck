import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useRealtimeList } from './useRealtimeList';

describe('useRealtimeList', () => {
  it('met à jour in-place un élément lors d’un événement SSE', async () => {
    let list;
    const Host = defineComponent({
      setup() {
        list = ref([
          { id: 1, request_id: 10, title: 'Item 1', status: 'pending' },
          { id: 2, request_id: 20, title: 'Item 2', status: 'pending' },
        ]);
        useRealtimeList(list, ['request.updated'], {
          keyFields: ['request_id', 'id'],
          debounceMs: 0,
        });
        return () => h('div');
      },
    });

    const wrapper = mount(Host);

    window.dispatchEvent(
      new CustomEvent('watchdeck:request.updated', {
        detail: {
          payload: { request_id: 10, status: 'available' },
        },
      }),
    );

    expect(list.value[0].status).toBe('available');
    expect(list.value[1].status).toBe('pending');
    wrapper.unmount();
  });

  it('appelle onFallbackReload si l’élément n’est pas trouvé dans la liste', async () => {
    const onFallbackReload = vi.fn();
    const Host = defineComponent({
      setup() {
        const list = ref([
          { id: 1, request_id: 10, title: 'Item 1' },
        ]);
        useRealtimeList(list, ['request.updated'], {
          keyFields: ['request_id', 'id'],
          onFallbackReload,
          debounceMs: 0,
        });
        return () => h('div');
      },
    });

    const wrapper = mount(Host);

    window.dispatchEvent(
      new CustomEvent('watchdeck:request.updated', {
        detail: {
          payload: { request_id: 999, status: 'available' },
        },
      }),
    );

    expect(onFallbackReload).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('patche tous les éléments correspondants lorsque patchAllMatches est vrai', async () => {
    let list;
    const Host = defineComponent({
      setup() {
        list = ref([
          { id: 1, tvdb_id: 500, title: 'Episode 1', has_file: false },
          { id: 2, tvdb_id: 500, title: 'Episode 2', has_file: false },
        ]);
        useRealtimeList(list, ['download.updated'], {
          keyFields: ['tvdb_id'],
          patchAllMatches: true,
          debounceMs: 0,
        });
        return () => h('div');
      },
    });

    const wrapper = mount(Host);

    window.dispatchEvent(
      new CustomEvent('watchdeck:download.updated', {
        detail: {
          payload: { tvdb_id: 500, has_file: true },
        },
      }),
    );

    expect(list.value[0].has_file).toBe(true);
    expect(list.value[1].has_file).toBe(true);
    wrapper.unmount();
  });
});
