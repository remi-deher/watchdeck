import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UpcomingReleasesPanel from './UpcomingReleasesPanel.vue';

const RouterLink = { props: ['to'], template: '<a :href="to"><slot /></a>' };

describe('UpcomingReleasesPanel', () => {
  it('utilise le rail media commun avec la destination calendrier', () => {
    const wrapper = mount(UpcomingReleasesPanel, {
      props: { items: [{ id: 1, title: 'Dune 3', media_type: 'movie', release_date: '2027-12-17' }] },
      global: { stubs: { RouterLink } },
    });
    expect(wrapper.find('.horizontal-rail-section').exists()).toBe(true);
    expect(wrapper.get('a.poster-link').attributes('href')).toBe('/calendar');
    expect(wrapper.get('.poster-action').text()).toContain('2027');
  });

  it('conserve son message vide specifique', () => {
    expect(mount(UpcomingReleasesPanel).text()).toContain('Aucune sortie à venir');
  });
});
