<template>
  <div v-if="hasMore" ref="sentinel" class="infinite-scroll-trigger" aria-hidden="true">
    <LoaderCircle v-if="loading" class="spin" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
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
let observer: IntersectionObserver | null = null;

function trigger(entries: IntersectionObserverEntry[]): void {
  if (entries[0]?.isIntersecting && props.hasMore && !props.loading) emit('load');
}

onMounted(() => {
  observer = new IntersectionObserver(trigger, { rootMargin: '400px' });
  if (sentinel.value) observer.observe(sentinel.value);
});
onBeforeUnmount(() => observer?.disconnect());
watch(sentinel, (el, prev) => {
  if (!observer) return;
  if (prev) observer.unobserve(prev);
  if (el) observer.observe(el);
});
</script>

<style scoped lang="scss">
.infinite-scroll-trigger { display: flex; justify-content: center; padding: var(--space-4) 0; min-height: 1px; }
</style>
