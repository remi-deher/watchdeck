import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import TabNav from './TabNav.vue';

describe('TabNav', () => {
  it('ajoute un sélecteur mobile à partir de trois onglets', async () => {
    const wrapper = mount(TabNav, {
      props: {
        modelValue: 'active',
        tabs: [
          { value: 'all', label: 'Tous' },
          { value: 'active', label: 'En cours' },
          { value: 'errors', label: 'Erreurs', count: 2 },
        ],
      },
    });

    expect(wrapper.find('.adaptive-tabs-select').exists()).toBe(true);
    expect(wrapper.findAll('option').map(option => option.text())).toEqual(['Tous', 'En cours', 'Erreurs (2)']);
    await wrapper.get('select').setValue('errors');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['errors']);
  });

  it('conserve le contrôle segmenté pour un choix binaire', () => {
    const wrapper = mount(TabNav, {
      props: {
        modelValue: 'all',
        tabs: [{ value: 'all', label: 'Recherche' }, { value: 'vf', label: 'VF' }],
      },
    });

    expect(wrapper.find('.adaptive-tabs-select').exists()).toBe(false);
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(2);
  });
});
