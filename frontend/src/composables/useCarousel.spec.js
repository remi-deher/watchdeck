import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';

import { useCarousel } from './useCarousel';

function monter(count, options) {
  let carousel;
  const wrapper = mount(defineComponent({
    setup() {
      carousel = useCarousel(count, options);
      return () => h('div');
    },
  }));
  return { carousel, wrapper };
}

const pointeur = (clientX, clientY = 0, target = document.body) => ({ clientX, clientY, target, cancelable: true, preventDefault: vi.fn() });

describe('useCarousel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('avance et recule en boucle, en notant le sens', () => {
    const { carousel } = monter(3);
    carousel.prev();
    expect(carousel.index.value).toBe(2);
    expect(carousel.direction.value).toBe('prev');
    carousel.next();
    expect(carousel.index.value).toBe(0);
    expect(carousel.direction.value).toBe('next');
    carousel.goTo(2);
    expect(carousel.index.value).toBe(2);
    carousel.goTo(1);
    expect(carousel.direction.value).toBe('prev');
  });

  it('défile seul, sauf en pause', () => {
    const { carousel, wrapper } = monter(3, { interval: 1000 });
    vi.advanceTimersByTime(1000);
    expect(carousel.index.value).toBe(1);
    carousel.pause();
    vi.advanceTimersByTime(3000);
    expect(carousel.index.value).toBe(1);
    carousel.resume();
    vi.advanceTimersByTime(1000);
    expect(carousel.index.value).toBe(2);
    wrapper.unmount();
    vi.advanceTimersByTime(3000);
    expect(carousel.index.value).toBe(2);
  });

  it('ne bouge pas avec une seule diapositive', () => {
    const { carousel } = monter(1, { interval: 1000 });
    carousel.next();
    vi.advanceTimersByTime(3000);
    expect(carousel.index.value).toBe(0);
  });

  it('change de diapositive sur un glissement horizontal suffisant', () => {
    const { carousel } = monter(3);
    carousel.onPointerDown(pointeur(200));
    const move = pointeur(150);
    carousel.onPointerMove(move);
    expect(move.preventDefault).toHaveBeenCalled();
    carousel.onPointerUp(pointeur(150));
    expect(carousel.index.value).toBe(1);

    // Geste vertical : la page défile, la diapositive reste.
    carousel.onPointerDown(pointeur(200, 0));
    carousel.onPointerMove(pointeur(190, 80));
    carousel.onPointerUp(pointeur(150, 80));
    expect(carousel.index.value).toBe(1);
  });

  it('ignore un appui parti d’un élément exclu', () => {
    const { carousel } = monter(3);
    const button = document.createElement('button');
    carousel.onPointerDown(pointeur(200, 0, button));
    carousel.onPointerMove(pointeur(100));
    carousel.onPointerUp(pointeur(100));
    expect(carousel.index.value).toBe(0);
  });

  it('revient au début quand la liste raccourcit', async () => {
    const count = ref(3);
    const { carousel } = monter(count);
    carousel.goTo(2);
    count.value = 2;
    await nextTick();
    expect(carousel.index.value).toBe(0);
  });
});
