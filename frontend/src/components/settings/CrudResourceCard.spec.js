import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CrudResourceCard from './CrudResourceCard.vue';
import { Server } from '@lucide/vue';

describe('CrudResourceCard', () => {
  const sampleColumns = [
    { key: 'name', label: 'Nom', isTitle: true },
    { key: 'url', label: 'Adresse' },
    { key: 'enabled', label: 'Statut', isStatus: true },
  ];

  const sampleItems = [
    { id: 1, name: 'Instance 1', url: 'http://localhost:8989', enabled: true },
  ];

  it('renders title and empty state when no items provided', () => {
    const wrapper = mount(CrudResourceCard, {
      props: {
        title: 'Test Card',
        icon: Server,
        columns: sampleColumns,
        items: [],
      },
    });

    expect(wrapper.text()).toContain('Test Card');
    expect(wrapper.text()).toContain('Aucun élément configuré.');
  });

  it('renders table with items when provided', () => {
    const wrapper = mount(CrudResourceCard, {
      props: {
        title: 'Test Card',
        icon: Server,
        columns: sampleColumns,
        items: sampleItems,
      },
    });

    expect(wrapper.text()).toContain('Instance 1');
    expect(wrapper.text()).toContain('http://localhost:8989');
    expect(wrapper.text()).toContain('Actif');
  });

  it('emits open-modal event when add button clicked', async () => {
    const wrapper = mount(CrudResourceCard, {
      props: {
        title: 'Test Card',
        icon: Server,
        columns: sampleColumns,
        items: [],
      },
    });

    const addBtn = wrapper.find('button.secondary');
    await addBtn.trigger('click');
    expect(wrapper.emitted('open-modal')).toBeTruthy();
  });
});
