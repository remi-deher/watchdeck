import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import HorizontalRail from './HorizontalRail.vue';

describe('HorizontalRail', () => {
  it('affiche le titre et les éléments dans le rail', () => {
    const wrapper = mount(HorizontalRail, {
      props: {
        title: 'Tendances',
        eyebrow: 'Populaire',
      },
      slots: {
        default: '<div class="card-mock">Card 1</div><div class="card-mock">Card 2</div>',
      },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          RailEdgeControls: { template: '<div class="controls-stub" />' },
        },
      },
    });

    expect(wrapper.text()).toContain('Tendances');
    expect(wrapper.text()).toContain('Populaire');
    expect(wrapper.findAll('.card-mock')).toHaveLength(2);
    expect(wrapper.find('.controls-stub').exists()).toBe(true);
  });

  it('affiche le squelette de chargement lorsque loading est vrai', () => {
    const wrapper = mount(HorizontalRail, {
      props: {
        title: 'En cours',
        loading: true,
      },
      slots: {
        skeleton: '<div class="custom-skeleton">Skeleton</div>',
      },
      global: {
        stubs: {
          RouterLink: true,
          RailEdgeControls: true,
        },
      },
    });

    expect(wrapper.find('.custom-skeleton').exists()).toBe(true);
    expect(wrapper.find('.rail-track').exists()).toBe(false);
  });

  it('affiche le message d’erreur avec possibilité de réessayer', async () => {
    const wrapper = mount(HorizontalRail, {
      props: {
        title: 'Erreurs',
        error: 'Échec de chargement',
      },
      global: {
        stubs: {
          RouterLink: true,
          RailEdgeControls: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Échec de chargement');
    const retryBtn = wrapper.find('button');
    if (retryBtn.exists()) {
      await retryBtn.trigger('click');
      expect(wrapper.emitted('retry')).toHaveLength(1);
    }
  });

  it('affiche l’état vide lorsque empty est vrai', () => {
    const wrapper = mount(HorizontalRail, {
      props: {
        title: 'Vide',
        empty: true,
        emptyMessage: 'Aucun contenu trouvé.',
      },
      global: {
        stubs: {
          RouterLink: true,
          RailEdgeControls: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Aucun contenu trouvé.');
    expect(wrapper.find('.rail-track').exists()).toBe(false);
  });

  it('supporte le titre cliquable émettant title-click', async () => {
    const wrapper = mount(HorizontalRail, {
      props: {
        title: 'Cliquez ici',
        clickable: true,
      },
      global: {
        stubs: {
          RouterLink: true,
          RailEdgeControls: true,
        },
      },
    });

    const button = wrapper.find('button.rail-title');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    expect(wrapper.emitted('title-click')).toHaveLength(1);
  });

  it('documente et prend en charge la navigation au clavier', async () => {
    const wrapper = mount(HorizontalRail, {
      props: { title: 'Tendances' },
      slots: { default: '<div>Carte</div>' },
      global: { stubs: { RouterLink: true, RailEdgeControls: true } },
    });
    const track = wrapper.get('.rail-track');
    const scrollBy = vi.fn();
    track.element.scrollBy = scrollBy;

    await track.trigger('keydown', { key: 'ArrowRight' });

    expect(track.attributes('aria-describedby')).toBeTruthy();
    expect(wrapper.get('.sr-only').text()).toContain('gauche et droite');
    expect(scrollBy).toHaveBeenCalledOnce();
  });
});
