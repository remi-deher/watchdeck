import { nextTick, reactive, watch, type Ref } from 'vue';
import { useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core';

export interface HorizontalRailState {
  canLeft: boolean;
  canRight: boolean;
}

export function useHorizontalRail(track: Ref<HTMLElement | null>) {
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

  // VueUse suit la ref du rail : les ecouteurs sont rebranches si l'element change et
  // retires au demontage. Taille et contenu modifient tous deux la place disponible.
  useEventListener(track, 'scroll', update, { passive: true });
  useResizeObserver(track, update);
  useMutationObserver(track, update, { childList: true, subtree: true });
  watch(track, async (el) => {
    if (!el) return;
    await nextTick();
    update();
  }, { flush: 'post', immediate: true });

  return { state, update, scroll, onKeydown };
}
