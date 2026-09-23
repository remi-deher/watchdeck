<template>
  <div v-if="hasMore" ref="sentinel" class="infinite-scroll-trigger" aria-hidden="true">
    <LoaderCircle v-if="loading" class="spin" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useEventListener, useIntersectionObserver } from '@vueuse/core';
import { LoaderCircle } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    hasMore?: boolean;
    loading?: boolean;
  }>(),
  {
    hasMore: false,
    loading: false,
  }
);
const emit = defineEmits<{
  (e: 'load'): void;
}>();

const sentinel = ref<HTMLElement | null>(null);
const MARGIN_PX = 400;

function trigger(entries: IntersectionObserverEntry[]): void {
  if (entries[0]?.isIntersecting && props.hasMore && !props.loading) emit('load');
}

// La sentinelle est sous `v-if` : VueUse suit la ref et rebranche l'observateur.
useIntersectionObserver(sentinel, trigger, { rootMargin: `${MARGIN_PX}px` });

/** Position reelle, mesuree maintenant : l'etat rapporte par l'observateur arrive apres
 *  la mise en page, et le lire ici donnait une valeur perimee -- chaque fin de
 *  chargement en relancait un autre, jusqu'a aspirer tout le catalogue. */
function isNearViewport(): boolean {
  const el = sentinel.value;
  if (!el || typeof window === 'undefined') return false;
  const box = el.getBoundingClientRect();
  return box.top < window.innerHeight + MARGIN_PX && box.bottom > -MARGIN_PX;
}

/* L'observateur ne se manifeste qu'a un CHANGEMENT de visibilite. Si la sentinelle etait
   deja visible quand le chargement precedent se terminait -- page courte, rendu en
   retard, grille virtualisee qui n'ajoute que quelques lignes --, plus rien ne la faisait
   « rentrer » a l'ecran : la pagination s'arretait net, meme en redescendant. On relance
   donc a la fin d'un chargement tant qu'elle reste visible. `nextTick` laisse d'abord les
   nouvelles lignes repousser la sentinelle avant de mesurer sa position. */
watch(() => props.loading, (loading, wasLoading) => {
  if (loading || !wasLoading) return;
  void nextTick(() => {
    if (props.hasMore && !props.loading && isNearViewport()) emit('load');
  });
});

/* Filet au defilement. L'observateur ne rappelle que pour un changement qu'il a lui-meme
   echantillonne : sous charge, la sentinelle pouvait sortir de l'ecran puis y revenir
   entre deux echantillons, et il la croyait visible sans discontinuer -- plus aucun
   rappel, la pagination restait bloquee. Une mesure par image, et seulement tant qu'il
   reste des pages : le cout est negligeable. */
let frame = 0;
function checkOnScroll(): void {
  if (frame || !props.hasMore || props.loading) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (props.hasMore && !props.loading && isNearViewport()) emit('load');
  });
}
if (typeof window !== 'undefined') useEventListener(window, 'scroll', checkOnScroll, { passive: true });
</script>

<style scoped lang="scss">
.infinite-scroll-trigger { display: flex; justify-content: center; padding: var(--space-4) 0; min-height: 1px; }
</style>
