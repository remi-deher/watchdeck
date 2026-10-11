import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import UiLookupField from './UiLookupField.vue';

const found = [
  { key: 'a', title: 'Dune', subtitle: '2021 · Déjà dans Radarr', payload: { id: 1 } },
  { key: 'b', title: 'Dune 2', subtitle: '2024 · Absent de Radarr', disabled: true, reason: 'Ajoutez-le d’abord.' },
];

describe('UiLookupField', () => {
  it('montre d’abord ce qui est retenu, et n’ouvre la recherche qu’à la demande', async () => {
    const wrapper = mount(UiLookupField, { props: { modelValue: { key: 'a', title: 'Dune', subtitle: '2021', note: 'Détecté automatiquement' }, search: vi.fn() } });
    expect(wrapper.text()).toContain('Détecté automatiquement');
    expect(wrapper.find('.ui-lookup__panel').exists()).toBe(false);
    await wrapper.get('.ui-lookup__change').trigger('click');
    expect(wrapper.find('.ui-lookup__panel').exists()).toBe(true);
  });

  it('ouvre la recherche d’emblée quand rien n’est retenu, cherche et propose les résultats', async () => {
    const search = vi.fn(async () => found);
    const wrapper = mount(UiLookupField, { props: { search, initialQuery: 'dune' } });
    expect(wrapper.text()).toContain('Rien de sélectionné');
    await wrapper.get('button.ui-button, .ui-lookup__row button').trigger('click');
    await flushPromises();
    expect(search).toHaveBeenCalledWith('dune');
    expect(wrapper.findAll('.ui-lookup__result')).toHaveLength(2);
  });

  it('ne retient pas un résultat indisponible, et dit pourquoi', async () => {
    const wrapper = mount(UiLookupField, { props: { search: async () => found, initialQuery: 'dune' } });
    await wrapper.get('.ui-lookup__row button').trigger('click');
    await flushPromises();
    const [ok, unavailable] = wrapper.findAll('.ui-lookup__result');
    expect(unavailable.attributes('disabled')).toBeDefined();
    expect(unavailable.attributes('title')).toBe('Ajoutez-le d’abord.');
    await ok.trigger('click');
    expect(wrapper.emitted('update:modelValue')[0][0]).toMatchObject({ key: 'a' });
  });

  it('annonce une recherche sans résultat', async () => {
    const wrapper = mount(UiLookupField, { props: { search: async () => [], initialQuery: 'zzz' } });
    await wrapper.get('.ui-lookup__row button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Aucun résultat pour « zzz ».');
  });
});
