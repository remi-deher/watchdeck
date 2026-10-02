import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SheetHero from './SheetHero.vue';

describe('SheetHero', () => {
  it('garde l’image seule dans la bannière et met affiche et texte dessous', () => {
    const wrapper = mount(SheetHero, {
      props: { imageUrl: '/fond.jpg', variant: 'sheet', bannerClass: 'mdh-hero', rowClass: ['mdh-row', { 'is-music': true }] },
      slots: { poster: '<img class="affiche" />', default: '<h2 class="titre">Titre</h2>', overlay: '<button class="retour">Retour</button>' },
    });
    const banner = wrapper.get('.sheet-hero__banner');
    expect(banner.classes()).toEqual(expect.arrayContaining(['mdh-hero', 'is-sheet']));
    // Le texte n'est plus pose sur l'image : il n'est pas dans la banniere.
    expect(banner.find('.titre').exists()).toBe(false);
    expect(banner.find('.retour').exists()).toBe(true);
    expect(wrapper.get('.sheet-hero__row').classes()).toEqual(expect.arrayContaining(['mdh-row', 'is-music']));
    expect(wrapper.get('.sheet-hero__poster .affiche').exists()).toBe(true);
    expect(wrapper.get('.sheet-hero__info .titre').text()).toBe('Titre');
  });

  it('sans affiche, pas d’emplacement vide qui décalerait le texte', () => {
    const wrapper = mount(SheetHero, { slots: { default: '<p>Texte</p>' } });
    expect(wrapper.find('.sheet-hero__poster').exists()).toBe(false);
    expect(wrapper.classes()).toContain('is-card');
  });

  it('expose l’empilement mobile et le débord des marges de la feuille', () => {
    const wrapper = mount(SheetHero, { props: { stackOnMobile: true, bleed: true, variant: 'sheet' } });
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['is-stacked', 'is-bleed', 'is-sheet']));
  });
});
