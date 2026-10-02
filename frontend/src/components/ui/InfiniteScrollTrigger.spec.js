import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import InfiniteScrollTrigger from './InfiniteScrollTrigger.vue';

/* Observateur pilotable : le test decide quand la sentinelle devient visible. */
let observe;
const OriginalObserver = globalThis.IntersectionObserver;
beforeEach(() => {
  globalThis.IntersectionObserver = class {
    constructor(callback) { observe = (isIntersecting) => callback([{ isIntersecting }]); }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
});
afterEach(() => { globalThis.IntersectionObserver = OriginalObserver; });

/* La relance mesure la position reelle de la sentinelle : on la place a la main. */
function placeSentinel(wrapper, top) {
  const el = wrapper.find('.infinite-scroll-trigger').element;
  el.getBoundingClientRect = () => ({ top, bottom: top + 1, left: 0, right: 10, width: 10, height: 1 });
}

describe('InfiniteScrollTrigger', () => {
  it('charge quand la sentinelle devient visible', async () => {
    const wrapper = mount(InfiniteScrollTrigger, { props: { hasMore: true, loading: false } });
    await nextTick();
    observe(true);
    expect(wrapper.emitted('load')).toHaveLength(1);
  });

  it('ne charge pas pendant un chargement en cours', async () => {
    const wrapper = mount(InfiniteScrollTrigger, { props: { hasMore: true, loading: true } });
    await nextTick();
    observe(true);
    expect(wrapper.emitted('load')).toBeUndefined();
  });

  it('relance a la fin d’un chargement si la sentinelle est restee visible', async () => {
    // Le cas qui bloquait la pagination : visible pendant le chargement, l'observateur
    // ne signale plus aucun changement ensuite.
    const wrapper = mount(InfiniteScrollTrigger, { props: { hasMore: true, loading: true } });
    await nextTick();
    observe(true);
    expect(wrapper.emitted('load')).toBeUndefined();
    placeSentinel(wrapper, 200);

    await wrapper.setProps({ loading: false });
    await nextTick();
    expect(wrapper.emitted('load')).toHaveLength(1);
  });

  it('ne relance pas si les nouvelles lignes ont repousse la sentinelle hors de portee', async () => {
    // L'observateur l'a vue visible pendant le chargement, mais l'etat qu'il rapporte est
    // en retard : seule la position mesuree a la fin du chargement fait foi.
    const wrapper = mount(InfiniteScrollTrigger, { props: { hasMore: true, loading: true } });
    await nextTick();
    observe(true);
    placeSentinel(wrapper, window.innerHeight + 5000);
    await wrapper.setProps({ loading: false });
    await nextTick();
    expect(wrapper.emitted('load')).toBeUndefined();
  });

  it('ne relance pas quand il ne reste rien a charger', async () => {
    const wrapper = mount(InfiniteScrollTrigger, { props: { hasMore: true, loading: true } });
    await nextTick();
    observe(true);
    placeSentinel(wrapper, 200);
    await wrapper.setProps({ loading: false, hasMore: false });
    await nextTick();
    expect(wrapper.emitted('load')).toBeUndefined();
  });

  it('rattrape au defilement un changement que l’observateur n’a pas vu', async () => {
    // Visible sans discontinuer pour l'observateur (aucun rappel), mais la page vient de
    // defiler et la sentinelle est bien a portee : le filet de defilement charge.
    const wrapper = mount(InfiniteScrollTrigger, { props: { hasMore: true, loading: false } });
    await nextTick();
    placeSentinel(wrapper, 300);
    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(wrapper.emitted('load')).toHaveLength(1);
  });

  it('ne charge pas au defilement tant que la sentinelle est loin', async () => {
    const wrapper = mount(InfiniteScrollTrigger, { props: { hasMore: true, loading: false } });
    await nextTick();
    placeSentinel(wrapper, window.innerHeight + 5000);
    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(wrapper.emitted('load')).toBeUndefined();
  });
});
