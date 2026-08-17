import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaRecommendations from './MediaRecommendations.vue';

describe('MediaRecommendations', () => {
  const items = [
    { tmdb_id: 101, media_type: 'movie', title: 'Interstellar', poster_url: '/interstellar.jpg' },
    { tmdb_id: 102, media_type: 'movie', title: 'Inception', poster_url: '/inception.jpg', in_library: true },
  ];

  it('affiche les titres recommandés et permet de demander un média non disponible', async () => {
    const wrapper = mount(MediaRecommendations, {
      props: {
        title: 'Titres similaires',
        items,
        allowRequest: true,
        requesting: [],
      },
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain('Titres similaires');
    expect(wrapper.text()).toContain('Interstellar');
    expect(wrapper.text()).toContain('Inception');

    const requestBtn = wrapper.find('button[aria-label="Demander Interstellar"]');
    expect(requestBtn.exists()).toBe(true);
    await requestBtn.trigger('click');

    expect(wrapper.emitted('request')).toBeTruthy();
    expect(wrapper.emitted('request')[0][0]).toEqual(items[0]);
  });
});
