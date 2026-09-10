/** Le champ dit ce qu'il fait : interroger un corpus, ou retrancher d'une liste. */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiSearchField from './UiSearchField.vue';

const mountField = (props = {}) => mount(UiSearchField, { props });

describe('UiSearchField', () => {
  it('distingue une recherche d’un filtre', () => {
    // Deux gestes opposés portaient la même barre : on ne pouvait pas savoir, en tapant,
    // si l'on élargissait ou si l'on retranchait.
    expect(mountField().classes()).toContain('is-search');
    expect(mountField({ kind: 'filter' }).classes()).toContain('is-filter');
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
