import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FilterSelectGroup from './FilterSelectGroup.vue';

describe('FilterSelectGroup', () => {
  const sampleFilters = [
    {
      key: 'status',
      label: 'Statut',
      value: 'all',
      options: [
        { value: 'all', label: 'Tous' },
        { value: 'active', label: 'Actifs' },
      ],
    },
  ];

  it('renders filter labels and options', () => {
    const wrapper = mount(FilterSelectGroup, {
      props: { filters: sampleFilters },
    });

    expect(wrapper.text()).toContain('Statut');
    expect(wrapper.text()).toContain('Tous');
    expect(wrapper.text()).toContain('Actifs');
  });

  it('emits update:filter when selection changes', async () => {
    const wrapper = mount(FilterSelectGroup, {
      props: { filters: sampleFilters },
    });

    const select = wrapper.find('select');
    await select.setValue('active');

    expect(wrapper.emitted('update:filter')).toBeTruthy();
    expect(wrapper.emitted('update:filter')[0][0]).toEqual({ key: 'status', value: 'active' });
  });
});
