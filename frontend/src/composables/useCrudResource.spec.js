import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createQueryClient } from '@/queryClient';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));

const { useCrudResource } = await import('./useCrudResource');

const DEFAULTS = { name: '', url: '', enabled: true };

function factory(messages) {
  let resource;
  mount(defineComponent({
    setup() {
      resource = useCrudResource('/api/things', DEFAULTS, messages);
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

  it('prepare un formulaire vierge en creation', () => {
    const { form, editingId, edit } = factory();
    edit(null);
    expect(editingId.value).toBeNull();
    expect({ ...form }).toEqual(DEFAULTS);
  });

  it('preremplit le formulaire en edition', () => {
    const { form, editingId, edit } = factory();
    edit({ id: 7, name: 'Sonarr', url: 'http://x' });
    expect(editingId.value).toBe(7);
    expect(form.name).toBe('Sonarr');
    expect(form.url).toBe('http://x');
  });

  it('ne laisse pas trainer les champs de l’edition precedente', () => {
    const { form, edit } = factory();
    edit({ id: 1, name: 'Premier', url: 'http://a' });
    edit({ id: 2, name: 'Second' });
    expect(form.name).toBe('Second');
    expect(form.url).toBe('');
  });

  it('cree par POST sur la racine', async () => {
    const { form, edit, saveOrThrow } = factory();
    edit(null);
    form.name = 'Nouveau';
    await saveOrThrow();
    const call = api.mock.calls.find(([path, options]) => path === '/api/things' && options?.method === 'POST');
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body).name).toBe('Nouveau');
  });

  it('met a jour par PUT sur l’element', async () => {
    const { edit, saveOrThrow } = factory();
    edit({ id: 42, name: 'Existant' });
    await saveOrThrow();
    expect(api).toHaveBeenCalledWith('/api/things/42', expect.objectContaining({ method: 'PUT' }));
  });

  it('rend l’echec a l’appelant, sans rester occupe', async () => {
    const { edit, saveOrThrow, busy } = factory();
    api.mockRejectedValueOnce(new Error('boum'));
    edit(null);
    await expect(saveOrThrow()).rejects.toThrow('boum');
    expect(busy.value).toBe(false);
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
