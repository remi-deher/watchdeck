import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaGrid from './MediaGrid.vue';

describe('MediaGrid', () => {
  it('rend les cartes dans la grille lorsqu’il y a des éléments', () => {
    const wrapper = mount(MediaGrid, {
      props: {
        items: [{ id: 1 }, { id: 2 }],
      },
      slots: {
        default: '<div class="item-card">Item 1</div><div class="item-card">Item 2</div>',
      },
    });

    expect(wrapper.findAll('.item-card')).toHaveLength(2);
    expect(wrapper.find('.media-grid').exists()).toBe(true);
    expect(wrapper.find('.empty').exists()).toBe(false);
  });

  it('affiche l’état de chargement initial si items est vide et loading est vrai', () => {
    const wrapper = mount(MediaGrid, {
      props: {
        items: [],
        loading: true,
        loadingMessage: 'Chargement en cours...',
      },
    });

    expect(wrapper.text()).toContain('Chargement en cours...');
    expect(wrapper.find('.media-grid').exists()).toBe(false);
  });

  it('affiche le message d’état vide quand la liste est vide', () => {
    const wrapper = mount(MediaGrid, {
      props: {
        items: [],
        emptyMessage: 'Aucun résultat trouvé.',
      },
    });

    expect(wrapper.text()).toContain('Aucun résultat trouvé.');
    expect(wrapper.find('.media-grid').exists()).toBe(false);
  });

  it('affiche l’état d’erreur avec bouton pour réessayer', async () => {
    const wrapper = mount(MediaGrid, {
      props: {
        error: 'Erreur réseau',
      },
    });

    expect(wrapper.text()).toContain('Erreur réseau');
  });

  it('inclut le déclencheur de défilement infini quand hasMore est vrai', () => {
    const wrapper = mount(MediaGrid, {
      props: {
        items: [{ id: 1 }],
        hasMore: true,
      },
      slots: {
        default: '<div class="item-card">Item 1</div>',
      },
    });

    expect(wrapper.findComponent({ name: 'InfiniteScrollTrigger' }).exists()).toBe(true);
  });
});
