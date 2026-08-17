import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaDetailHero from './MediaDetailHero.vue';

describe('MediaDetailHero', () => {
  it('priorise le chargement de l’affiche principale avec une taille responsive', () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Inception',
          media_type: 'movie',
          poster_url: '/poster.jpg',
        },
      },
    });

    const image = wrapper.get('.mdh-poster img');
    expect(image.attributes('loading')).toBe('eager');
    expect(image.attributes('fetchpriority')).toBe('high');
    expect(image.attributes('sizes')).toContain('140px');
  });

  it('affiche le bouton Demander la série quand le média n’est pas disponible ni demandé', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Breaking Bad',
          media_type: 'show',
          year: 2008,
          available: false,
          in_library: false,
          requested: false,
        },
      },
    });

    const btn = wrapper.find('.mdh-request-btn');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain('Demander la série');

    await btn.trigger('click');
    expect(wrapper.emitted('request')).toHaveLength(1);
  });

  it('affiche le bouton Demander ce film pour un film non suivi', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Inception',
          media_type: 'movie',
          year: 2010,
          available: false,
          in_library: false,
          requested: false,
        },
      },
    });

    const btn = wrapper.find('.mdh-request-btn');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain('Demander ce film');

    await btn.trigger('click');
    expect(wrapper.emitted('request')).toHaveLength(1);
  });

  it('masque le bouton Demander quand le média est déjà dans Plex ou demandé', () => {
    const wrapperInPlex = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Inception',
          media_type: 'movie',
          in_library: true,
        },
      },
    });
    expect(wrapperInPlex.find('.mdh-request-btn').exists()).toBe(false);

    const wrapperRequested = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Inception',
          media_type: 'movie',
          requested: true,
          request_id: 12,
        },
      },
    });
    expect(wrapperRequested.find('.mdh-request-btn').exists()).toBe(false);
  });

  it('affiche le bouton Rechercher pour un film en bibliothèque si admin', () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Soulm8te',
          media_type: 'movie',
          in_library: true,
          library_id: 42,
        },
        admin: true,
      },
    });

    expect(wrapper.text()).toContain('Rechercher');
  });

  it('affiche le bouton Rechercher pour une série si admin et émet open-audio au clic', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Severance',
          media_type: 'show',
          in_library: true,
          library_id: 99,
        },
        admin: true,
      },
    });

    const btn = wrapper.findAll('.mdh-link').find(b => b.text().includes('Rechercher'));
    expect(btn).toBeDefined();
    await btn.trigger('click');
    expect(wrapper.emitted('open-audio')).toHaveLength(1);
  });

  it('masque les boutons de recherche pour les non-admins', () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Soulm8te',
          media_type: 'movie',
          in_library: true,
          library_id: 42,
        },
        admin: false,
      },
    });

    expect(wrapper.text()).not.toContain('Rechercher');
  });
});
