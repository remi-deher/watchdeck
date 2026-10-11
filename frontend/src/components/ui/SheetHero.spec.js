import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/* Le dock : chaque élément, dans l'ordre, se glisse à droite de l'affiche tant qu'il tient
   sans en dépasser le bas ; le premier qui ne tient pas, et les suivants, restent dessous.
   jsdom ne mesure rien : on lui donne les hauteurs. */
describe('SheetHero · dock', () => {
  let observers;
  const layout = { posterBottom: 300, mainBottom: 200, heights: { badges: 40, dates: 40, actions: 60 } };
  beforeEach(() => {
    observers = [];
    globalThis.ResizeObserver = class { constructor(cb) { observers.push(cb); } observe() {} disconnect() {} };
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      if (this.classList.contains('sheet-hero__poster')) return { top: 0, bottom: layout.posterBottom, height: layout.posterBottom, left: 0, right: 0, width: 0 };
      if (this.classList.contains('sheet-hero__main')) return { top: 0, bottom: layout.mainBottom, height: layout.mainBottom, left: 0, right: 0, width: 0 };
      return { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0 };
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function height() {
      return layout.heights[this.firstElementChild?.dataset?.key] ?? 0;
    });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); delete globalThis.ResizeObserver; });

  const item = (key) => `<span data-key="${key}" class="dock-${key}">${key}</span>`;
  const slots = { poster: '<img class="affiche" />', default: '<p>Texte</p>', 'dock-badges': item('badges'), 'dock-dates': item('dates'), 'dock-actions': item('actions') };
  const place = async (extra = {}) => {
    const wrapper = mount(SheetHero, { props: { dock: ['badges', 'dates', 'actions'], ...extra }, slots, attachTo: document.body });
    await flushPromises();
    return wrapper;
  };
  const inZone = (wrapper, zone) => wrapper.findAll(`${zone} .sheet-hero__dock-item span`).map((node) => node.text());

  it('se glisse à droite tant que ça tient, le reste dessous, dans l’ordre', async () => {
    const wrapper = await place();
    // 200 + 12 + 40 = 252 ≤ 300 : le premier tient ; 264 + 40 = 304 > 300 : le deuxième non.
    expect(inZone(wrapper, '.sheet-hero__aside')).toEqual(['badges']);
    expect(inZone(wrapper, '.sheet-hero__dock')).toEqual(['dates', 'actions']);
    wrapper.unmount();
  });

  it('tout à droite quand le texte est court et que tout tient', async () => {
    layout.mainBottom = 60;
    const wrapper = await place();
    expect(inZone(wrapper, '.sheet-hero__aside')).toEqual(['badges', 'dates', 'actions']);
    expect(wrapper.find('.sheet-hero__dock').exists()).toBe(false);
    layout.mainBottom = 200;
    wrapper.unmount();
  });

  it('tout dessous quand le texte dépasse déjà le bas de l’affiche', async () => {
    layout.mainBottom = 320;
    const wrapper = await place();
    expect(wrapper.find('.sheet-hero__aside').exists()).toBe(false);
    expect(inZone(wrapper, '.sheet-hero__dock')).toEqual(['badges', 'dates', 'actions']);
    layout.mainBottom = 200;
    wrapper.unmount();
  });

  it('suit le texte en direct : déplier le résumé fait descendre ce qui ne tient plus', async () => {
    layout.mainBottom = 60;
    const wrapper = await place();
    expect(inZone(wrapper, '.sheet-hero__aside')).toHaveLength(3);
    layout.mainBottom = 230;
    observers.forEach((notify) => notify());
    await flushPromises();
    expect(inZone(wrapper, '.sheet-hero__aside')).toEqual(['badges']);
    expect(inZone(wrapper, '.sheet-hero__dock')).toEqual(['dates', 'actions']);
    layout.mainBottom = 200;
    wrapper.unmount();
  });

  it('ignore un élément vide : pas de trou ni de ligne vide', async () => {
    const wrapper = mount(SheetHero, { props: { dock: ['badges', 'dates', 'actions'] }, slots: { ...slots, 'dock-dates': '' }, attachTo: document.body });
    await flushPromises();
    expect(inZone(wrapper, '.sheet-hero__aside')).toEqual(['badges']);
    expect(inZone(wrapper, '.sheet-hero__dock')).toEqual(['actions']);
    wrapper.unmount();
  });

  it('sans affiche, tout reste dessous', async () => {
    const wrapper = mount(SheetHero, { props: { dock: ['badges', 'dates'] }, slots: { default: '<p>Texte</p>', 'dock-badges': item('badges'), 'dock-dates': item('dates') }, attachTo: document.body });
    await flushPromises();
    expect(wrapper.find('.sheet-hero__aside').exists()).toBe(false);
    expect(inZone(wrapper, '.sheet-hero__dock')).toEqual(['badges', 'dates']);
    wrapper.unmount();
  });
});
