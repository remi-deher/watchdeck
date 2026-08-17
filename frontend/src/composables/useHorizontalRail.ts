import { nextTick, onBeforeUnmount, reactive, watch, type Ref } from 'vue';

export interface HorizontalRailState {
  canLeft: boolean;
  canRight: boolean;
}

export function useHorizontalRail(track: Ref<HTMLElement | null>) {
  let observer: ResizeObserver | null = null;
  let mutations: MutationObserver | null = null;
  const state = reactive<HorizontalRailState>({ canLeft: false, canRight: false });

  function update(): void {
    const el = track.value;
    if (!el) return;
    state.canLeft = el.scrollLeft > 4;
    state.canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
  }

  function scroll(direction: number): void {
    const el = track.value;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.82, 280), behavior: 'smooth' });
  }

  function onKeydown(event: KeyboardEvent): void {
    const el = track.value;
    if (!el) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      scroll(event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      el.scrollTo({ left: event.key === 'Home' ? 0 : el.scrollWidth, behavior: 'smooth' });
    }
  }

  watch(
    track,
    async (el, previous) => {
      previous?.removeEventListener('scroll', update);
      observer?.disconnect();
      mutations?.disconnect();
      if (!el) return;
      el.addEventListener('scroll', update, { passive: true });
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(update);
        observer.observe(el);
      }
      if (typeof MutationObserver !== 'undefined') {
        mutations = new MutationObserver(update);
        mutations.observe(el, { childList: true, subtree: true });
      }
      await nextTick();
      update();
    },
    { flush: 'post' }
  );

  onBeforeUnmount(() => {
    track.value?.removeEventListener('scroll', update);
    observer?.disconnect();
    mutations?.disconnect();
  });

  return { state, update, scroll, onKeydown };
}
