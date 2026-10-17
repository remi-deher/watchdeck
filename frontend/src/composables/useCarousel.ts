import { onMounted, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

/* Mecanique commune d'un carrousel : diapositive courante, sens du dernier mouvement (pour
   la transition), defilement automatique suspendu au survol, au focus et pendant un
   geste, glissement horizontal au doigt ou a la souris. Le composant ne garde que son
   rendu : il branche `pause` / `resume` et les gestionnaires de pointeur sur sa surface. */

export interface CarouselOptions {
  /** Delai entre deux diapositives en defilement automatique. */
  interval?: number;
  /** Distance horizontale (px) a partir de laquelle un glissement change de diapositive. */
  swipeThreshold?: number;
  /** Elements depuis lesquels un appui ne lance pas de glissement (boutons, liens...). */
  ignoreSwipeFrom?: string;
}

export type CarouselDirection = 'next' | 'prev';

export function useCarousel(count: MaybeRefOrGetter<number>, options: CarouselOptions = {}) {
  const { interval = 7000, swipeThreshold = 35, ignoreSwipeFrom = 'button, a' } = options;
  const total = () => toValue(count);

  const index = ref(0);
  const direction = ref<CarouselDirection>('next');

  let timer: ReturnType<typeof setInterval> | null = null;
  // Sans mouvement demande, rien ne defile seul : seule une action change la diapositive.
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start(): void {
    if (reducedMotion || total() <= 1) return;
    stop();
    timer = setInterval(() => {
      direction.value = 'next';
      index.value = (index.value + 1) % total();
    }, interval);
  }

  function restart(): void {
    stop();
    start();
  }

  function goTo(target: number): void {
    if (target === index.value) return;
    direction.value = target > index.value ? 'next' : 'prev';
    index.value = target;
    restart();
  }

  function next(): void {
    if (total() <= 1) return;
    direction.value = 'next';
    index.value = (index.value + 1) % total();
    restart();
  }

  function prev(): void {
    if (total() <= 1) return;
    direction.value = 'prev';
    index.value = (index.value - 1 + total()) % total();
    restart();
  }

  /* Glissement : le sens (horizontal ou vertical) se decide apres quelques pixels ; un
     geste vertical laisse defiler la page, un geste horizontal la retient. */
  let dragStartX: number | null = null;
  let dragStartY: number | null = null;
  let isHorizontal: boolean | null = null;
  let dragging = false;

  function endDrag(): void {
    dragging = false;
    dragStartX = null;
    dragStartY = null;
    isHorizontal = null;
  }

  function onPointerDown(event: PointerEvent): void {
    if (total() <= 1) return;
    if ((event.target as HTMLElement)?.closest(ignoreSwipeFrom)) return;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    isHorizontal = null;
    dragging = true;
    stop();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging || dragStartX === null || dragStartY === null) return;
    const diffX = event.clientX - dragStartX;
    const diffY = event.clientY - dragStartY;
    if (isHorizontal === null && (Math.abs(diffX) > 8 || Math.abs(diffY) > 8)) {
      isHorizontal = Math.abs(diffX) > Math.abs(diffY);
    }
    if (isHorizontal && event.cancelable) event.preventDefault();
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging || dragStartX === null) return;
    const delta = event.clientX - dragStartX;
    if (isHorizontal && Math.abs(delta) >= swipeThreshold) {
      if (delta < 0) next();
      else prev();
    } else {
      start();
    }
    endDrag();
  }

  function onPointerCancel(): void {
    endDrag();
    start();
  }

  // Une liste raccourcie ne laisse pas l'index pointer dans le vide.
  watch(total, (length) => {
    if (index.value >= length) index.value = 0;
    restart();
  });

  onMounted(start);
  onUnmounted(stop);

  return {
    index,
    direction,
    goTo,
    next,
    prev,
    pause: stop,
    resume: start,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
