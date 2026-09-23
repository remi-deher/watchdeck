import { mount } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let realtimeHandler;
vi.mock('@/events', () => ({ useRealtime: (_types, handler) => { realtimeHandler = handler; } }));

import { matchesAnyKey, patchedAll, patchedList, useRealtimeQuery } from './useRealtimeQuery';

describe('patchedList', () => {
  const list = Object.freeze([
    Object.freeze({ id: 1, request_id: 10, status: 'pending' }),
    Object.freeze({ id: 2, request_id: 20, status: 'pending' }),
  ]);

  it('rend une nouvelle liste sans toucher a l’originale ni a ses elements', () => {
    // Liste et elements geles : toute mutation leverait une erreur.
    const { list: next, patched } = patchedList(list, { request_id: 20, status: 'available', action: 'updated' });
    expect(patched).toBe(true);
    expect(next).not.toBe(list);
    expect(next[1]).toEqual({ id: 2, request_id: 20, status: 'available' });
    expect(next[0]).toBe(list[0]);
    expect(list[1].status).toBe('pending');
  });

  it('ignore les champs indefinis et le champ action', () => {
    const { list: next } = patchedList(list, { id: 1, status: undefined, action: 'updated', title: 'Dune' });
    expect(next[0]).toEqual({ id: 1, request_id: 10, status: 'pending', title: 'Dune' });
  });

  it('insere en tete un element cree, et seulement lui', () => {
    expect(patchedList(list, { id: 3, action: 'created' }).list.map((item) => item.id)).toEqual([3, 1, 2]);
    expect(patchedList(list, { id: 3 })).toEqual({ list: [...list], patched: false });
    expect(patchedList(list, { id: 3 }, { autoInsert: true }).list[0]).toEqual({ id: 3 });
  });

  it('compare les cles en texte, et seulement celles demandees', () => {
    expect(matchesAnyKey({ id: 5 }, { id: '5' })).toBe(true);
    expect(matchesAnyKey({ id: 5, tmdb_id: 9 }, { tmdb_id: 9 }, ['id'])).toBe(false);
  });

  it('patchedAll met a jour chaque occurrence', () => {
    const doubled = [{ tmdb_id: 7, v: 1 }, { tmdb_id: 8, v: 1 }, { tmdb_id: 7, v: 1 }];
    const { list: next, patched } = patchedAll(doubled, { tmdb_id: 7, v: 2 });
    expect(patched).toBe(true);
    expect(next.map((item) => item.v)).toEqual([2, 1, 2]);
    expect(doubled[0].v).toBe(1);
  });
});

describe('useRealtimeQuery', () => {
  let queryClient;
  let api;
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['demandes'], { items: [{ id: 1, status: 'pending' }], facets: { requesters: [] } });
    const Host = defineComponent({
      setup() {
        api = useRealtimeQuery(['demandes'], ['request.updated'], {
          getList: (data) => data.items,
          setList: (data, items) => ({ ...data, items }),
        });
        return () => h('div');
      },
    });
    mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  });

  it('reporte un evenement sur l’element en cache, sans relecture', () => {
    const before = queryClient.getQueryData(['demandes']);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    realtimeHandler('request.updated', { payload: { id: 1, status: 'available' } });
    const after = queryClient.getQueryData(['demandes']);
    expect(after.items[0].status).toBe('available');
    expect(after.facets).toBe(before.facets);
    expect(before.items[0].status).toBe('pending');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('relit la liste pour un element inconnu ou un evenement sans contenu', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    realtimeHandler('request.updated', { payload: { id: 99, status: 'available' } });
    realtimeHandler(undefined, undefined);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['demandes'] });
  });

  it('expose apply pour les mises a jour locales', () => {
    expect(api.apply({ id: 1, status: 'rejected' })).toBe(true);
    expect(queryClient.getQueryData(['demandes']).items[0].status).toBe('rejected');
  });
});
