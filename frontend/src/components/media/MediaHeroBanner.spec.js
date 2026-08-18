import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaHeroBanner from './MediaHeroBanner.vue';

describe('MediaHeroBanner', () => {
  it('affiche les détails du premier élément', () => {
    const wrapper = mount(MediaHeroBanner, {
      props: {
        item: {
          id: 1,
          title: 'Inception',
          overview: 'Un voleur qui s’infiltre dans les rêves.',
          backdrop_url: 'https://image.tmdb.org/t/p/w1280/inception.jpg',
          year: 2010,
        },
      },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          MediaStatusBadge: { template: '<span class="status-badge-stub" />' },
        },
      },
    });

    expect(wrapper.text()).toContain('Inception');
    expect(wrapper.text()).toContain('Un voleur qui s’infiltre dans les rêves.');
    expect(wrapper.text()).toContain('2010');
  });

  it('affiche le squelette en état de chargement sans éléments', () => {
    const wrapper = mount(MediaHeroBanner, {
      props: {
        items: [],
        loading: true,
      },
      global: {
        stubs: {
          RouterLink: true,
          MediaStatusBadge: true,
        },
      },
    });

    expect(wrapper.find('.hero-loading').exists()).toBe(true);
  });

  it('rend les points de navigation et change de diapositive au clic', async () => {
    const wrapper = mount(MediaHeroBanner, {
      props: {
        items: [
          { id: 1, title: 'Film 1', art_url: 'http://example.com/1.jpg' },
          { id: 2, title: 'Film 2', art_url: 'http://example.com/2.jpg' },
        ],
      },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          MediaStatusBadge: true,
        },
      },
    });

    const dots = wrapper.findAll('.hero-dot');
    expect(dots).toHaveLength(2);
    expect(dots[0].classes()).toContain('active');
    expect(wrapper.text()).toContain('Film 1');

    await dots[1].trigger('click');
    expect(dots[1].classes()).toContain('active');
    expect(wrapper.text()).toContain('Film 2');

    // Navigation au clavier
    await wrapper.find('.media-hero-banner').trigger('keydown', { key: 'ArrowLeft' });
    expect(dots[0].classes()).toContain('active');
    expect(wrapper.text()).toContain('Film 1');
  });

  it('génère le bon lien de fiche pour un élément de bibliothèque', () => {
    const wrapper = mount(MediaHeroBanner, {
      props: {
        item: {
          id: 42,
          _kind: 'library',
          title: 'Gladiator',
          media_type: 'movie',
        },
        discoverContext: false,
      },
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
          MediaStatusBadge: true,
        },
      },
    });

    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('/library/media/library/42');
  });

  it('génère le bon lien de fiche pour une demande en cours', () => {
    const wrapper = mount(MediaHeroBanner, {
      props: {
        item: {
          id: 15,
          _kind: 'request',
          title: 'Dune 2',
          media_type: 'movie',
        },
        discoverContext: false,
      },
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
          MediaStatusBadge: true,
        },
      },
    });

    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('/library/media/request/15');
  });
});
