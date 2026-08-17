import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import RecentNotificationsPanel from './RecentNotificationsPanel.vue';
import TopRequestedPanel from './TopRequestedPanel.vue';

const RouterLink = { props: ['to'], template: '<a :href="to"><slot /></a>' };

describe('dashboard list panels', () => {
  it('partage la liste commune pour les notifications', () => {
    const wrapper = mount(RecentNotificationsPanel, {
      props: { notifications: [{ id: 1, media_title: 'Dune', event_label: 'Disponible', recipient: 'Rémi', success: true }] },
      global: { stubs: { RouterLink } },
    });
    expect(wrapper.find('.panel-list').exists()).toBe(true);
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('Envoyé');
  });

  it('partage la liste commune et conserve l etat vide des demandes', () => {
    const wrapper = mount(TopRequestedPanel, {
      props: { items: [{ id: 1, title: 'Dune', media_type: 'movie', count: 3 }] },
    });
    expect(wrapper.find('.panel-list').exists()).toBe(true);
    expect(wrapper.text()).toContain('3 demandeurs');
    expect(mount(TopRequestedPanel).find('.empty').exists()).toBe(true);
  });
});
