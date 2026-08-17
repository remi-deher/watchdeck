import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConnectionTestAction from './ConnectionTestAction.vue';

describe('ConnectionTestAction', () => {
  it('émet le test et accepte une icône personnalisée', async () => {
    const wrapper = mount(ConnectionTestAction, {
      props: { label: 'Tester Plex' },
      slots: { icon: '<span class="custom-icon" />' },
    });
    expect(wrapper.text()).toContain('Tester Plex');
    expect(wrapper.find('.custom-icon').exists()).toBe(true);
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('test')).toHaveLength(1);
  });

  it('indique le chargement et désactive l’action', () => {
    const wrapper = mount(ConnectionTestAction, { props: { loading: true } });
    expect(wrapper.text()).toContain('Test en cours…');
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button').attributes('aria-busy')).toBe('true');
  });
});
