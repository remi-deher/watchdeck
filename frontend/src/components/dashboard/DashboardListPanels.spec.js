import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TopRequestedPanel from './TopRequestedPanel.vue';

const RouterLink = { props: ['to'], template: '<a :href="to"><slot /></a>' };

describe('dashboard list panels', () => {
  it('partage la liste commune et conserve l etat vide des demandes', () => {
    const wrapper = mount(TopRequestedPanel, {
      props: { items: [{ id: 1, title: 'Dune', media_type: 'movie', count: 3 }] },
    });
    expect(wrapper.find('.panel-list').exists()).toBe(true);
    expect(wrapper.text()).toContain('3 demandeurs');
    expect(mount(TopRequestedPanel).find('.empty').exists()).toBe(true);
  });
});
