import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createQueryClient } from '@/queryClient';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));

const { useCrudResource } = await import('./useCrudResource');

function factory(messages) {
  let resource;
  mount(defineComponent({
    setup() {
      resource = useCrudResource('/api/things', messages);
      return () => h('div');
    },
  }), { global: { plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]] } });
  return resource;
}

describe('useCrudResource', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue([]);
  });

  it('charge la liste depuis la racine REST', async () => {
    api.mockResolvedValueOnce([{ id: 1, name: 'Un' }]);
    const { items, load } = factory();
    await load();
    expect(api).toHaveBeenCalledWith('/api/things');
    expect(items.value).toEqual([{ id: 1, name: 'Un' }]);
  });

  it('bascule l’activation puis recharge', async () => {
    const { toggle } = factory();
    await toggle({ id: 5 });
    expect(api).toHaveBeenCalledWith('/api/things/5/toggle', { method: 'PATCH' });
  });

  it('supprime après confirmation', async () => {
    const askConfirm = vi.fn().mockResolvedValue(true);
    const { remove } = factory({ confirmTitle: 'Supprimer ?' });
    await remove({ id: 9, name: 'Cible' }, askConfirm);
    expect(askConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Supprimer ?', danger: true }));
    expect(api).toHaveBeenCalledWith('/api/things/9', { method: 'DELETE' });
  });

  it('n’appelle rien si la confirmation est refusée', async () => {
    const askConfirm = vi.fn().mockResolvedValue(false);
    const { remove } = factory();
    api.mockClear();
    await remove({ id: 9, name: 'Cible' }, askConfirm);
    expect(api).not.toHaveBeenCalled();
  });
});
