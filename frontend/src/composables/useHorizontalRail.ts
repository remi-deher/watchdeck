import { nextTick, onScopeDispose, reactive, watch, type Ref } from 'vue';
import { useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core';

export interface HorizontalRailState {
  canLeft: boolean;
  canRight: boolean;
}

export function useHorizontalRail(track: Ref<HTMLElement | null>) {
  const state = reactive<HorizontalRailState>({ canLeft: false, canRight: false });

  function measure(): void {
    frame = 0;
    const el = track.value;
    if (!el) return;
    const canLeft = el.scrollLeft > 4;
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    if (state.canLeft !== canLeft) state.canLeft = canLeft;
    if (state.canRight !== canRight) state.canRight = canRight;
  }

  /* Lire scrollLeft/scrollWidth oblige le navigateur a recalculer la mise en page sur-le-
     champ. Appelee directement par les observateurs, cette lecture tombait a chaque
     mutation du rail -- chaque vignette chargee, chaque carte revelee -- et, pendant
     l'ouverture d'une fiche qui en compte plusieurs, figeait l'animation des secondes
     entieres sur mobile. Les demandes sont donc regroupees en une lecture par image. */
  let frame = 0;
  function update(): void {
    if (frame || typeof requestAnimationFrame === 'undefined') {
      if (!frame) measure();
      return;
    }
    frame = requestAnimationFrame(measure);
  }
  onScopeDispose(() => { if (frame) cancelAnimationFrame(frame); });

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
