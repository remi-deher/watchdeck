import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CrudResourceList from './CrudResourceList.vue';
import { Server } from '@lucide/vue';

describe('CrudResourceList', () => {
  const sampleItems = [
    { id: 1, name: 'Instance 1', url: 'http://localhost:8989', enabled: true },
  ];

  it('affiche le titre et le message vide sans élément', () => {
    const wrapper = mount(CrudResourceList, {
      props: { title: 'Test Liste', icon: Server, items: [] },
    });

    expect(wrapper.text()).toContain('Test Liste');
    expect(wrapper.text()).toContain('Aucun élément configuré.');
  });

  it('affiche une ligne par élément, avec son adresse et son état', () => {
    const wrapper = mount(CrudResourceList, {
      props: { title: 'Test Liste', icon: Server, items: sampleItems },
    });

    expect(wrapper.findAll('.settings-item')).toHaveLength(1);
    expect(wrapper.text()).toContain('Instance 1');
    expect(wrapper.text()).toContain('http://localhost:8989');
    expect(wrapper.text()).toContain('Actif');
  });

  it('ouvre le formulaire : vide depuis Ajouter, rempli depuis la ligne', async () => {
    const wrapper = mount(CrudResourceList, {
      props: { title: 'Test Liste', icon: Server, items: sampleItems },
    });

    await wrapper.find('.settings-item-list-actions button').trigger('click');
    expect(wrapper.emitted('open-modal')?.[0]).toEqual([]);

    await wrapper.find('button.settings-item-main').trigger('click');
    expect(wrapper.emitted('open-modal')?.[1]).toEqual([sampleItems[0]]);
  });

  it('masque Activer et Supprimer sur une ligne verrouillée', () => {
    const wrapper = mount(CrudResourceList, {
      props: { title: 'Test Liste', icon: Server, items: [{ ...sampleItems[0], is_primary: true }], lockedKey: 'is_primary' },
    });

    expect(wrapper.find('[aria-label="Supprimer"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Tester"]').exists()).toBe(true);
  });
});
