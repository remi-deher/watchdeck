/** Une seule capsule : recherche et filtre ont le même aspect, seul le compteur les distingue. */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiSearchField from './UiSearchField.vue';

const mountField = (props = {}) => mount(UiSearchField, { props });

describe('UiSearchField · niveaux', () => {
  it('se marque « elevated » quand la page défile, et pas autrement', async () => {
    const wrapper = mountField();
    expect(wrapper.classes()).not.toContain('is-elevated');
    await wrapper.setProps({ elevated: true });
    expect(wrapper.classes()).toContain('is-elevated');
  });
});

describe('UiSearchField', () => {
  it('garde la même icône pour une recherche et un filtre', () => {
    // Le liseré et l'entonnoir distinguaient les deux gestes ; la capsule est désormais
    // identique partout, c'est le compteur « N sur M » qui signale un sous-ensemble.
    expect(mountField().classes()).toContain('is-search');
    expect(mountField({ kind: 'filter' }).classes()).toContain('is-filter');
    expect(mountField({ kind: 'filter' }).html()).toBe(mountField().html().replace('is-search', 'is-filter'));
  });

  it('annonce « N sur M » quand le total non filtré est connu', () => {
    // Sans compteur, une liste filtrée se lit comme une liste complète.
    const wrapper = mountField({ kind: 'filter', query: 'lisa', matchCount: 43, totalCount: 348 });

    expect(wrapper.get('.ui-search-field__matches').text()).toBe('43 sur 348');
  });

  it('n’annonce que le nombre de résultats quand le total est inconnu', () => {
    // Les vues qui filtrent en base reçoivent le total *de la requête courante* :
    // annoncer « 12 sur 12 » y serait faux.
    const wrapper = mountField({ kind: 'filter', query: 'film', matchCount: 36, totalCount: null });

    expect(wrapper.get('.ui-search-field__matches').text()).toBe('36 résultats');
  });

  it('se tait quand le filtre ne retranche rien', () => {
    // Sur une liste entière, le compteur répéterait ce que la page dit déjà.
    const wrapper = mountField({ kind: 'filter', query: '', matchCount: 348, totalCount: 348 });

    expect(wrapper.find('.ui-search-field__matches').exists()).toBe(false);
  });

  it('ne compte jamais sur une recherche', () => {
    // Une recherche peut ramener ce qui n'est pas à l'écran : « N sur M » n'aurait
    // aucun dénominateur.
    const wrapper = mountField({ kind: 'search', query: 'dune', matchCount: 3, totalCount: 90 });

    expect(wrapper.find('.ui-search-field__matches').exists()).toBe(false);
  });

  it('offre d’effacer la saisie, et prévient la page', async () => {
    // La croix native n'existe pas partout et n'émet pas d'évènement exploitable.
    const wrapper = mountField({ query: 'dune' });

    await wrapper.get('.ui-search-field__clear').trigger('click');

    expect(wrapper.emitted('update:query')[0]).toEqual(['']);
    expect(wrapper.emitted('search')).toBeTruthy();
  });

  it('ne propose pas d’effacer un champ vide', () => {
    expect(mountField({ query: '' }).find('.ui-search-field__clear').exists()).toBe(false);
  });
});


describe('zones facultatives', () => {
  it.each([[false, false], [true, false], [false, true], [true, true]])('action %s et filtres %s coexistent', (action, filters) => {
    const wrapper = mount(UiSearchField, {
      props: { hasFilters: filters },
      slots: action ? { action: '<button>Pause</button>' } : {},
    });
    expect(wrapper.find('input').exists()).toBe(true);
    expect(wrapper.find('.ui-search-field__action').exists()).toBe(action);
    expect(wrapper.find('.ui-search-field__filter').exists()).toBe(filters);
  });
});
