<template>
  <div v-if="hasMore" ref="sentinel" class="infinite-scroll-trigger" aria-hidden="true">
    <LoaderCircle v-if="loading" class="spin" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useIntersectionObserver } from '@vueuse/core';
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

function trigger(entries: IntersectionObserverEntry[]): void {
  if (entries[0]?.isIntersecting && props.hasMore && !props.loading) emit('load');
}

// La sentinelle est sous `v-if` : VueUse suit la ref et rebranche l'observateur.
useIntersectionObserver(sentinel, trigger, { rootMargin: '400px' });
</script>

<style scoped lang="scss">
.infinite-scroll-trigger { display: flex; justify-content: center; padding: var(--space-4) 0; min-height: 1px; }
</style>
