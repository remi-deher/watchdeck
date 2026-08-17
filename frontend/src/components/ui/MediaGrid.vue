<template>
  <div class="media-grid-shell">
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="$emit('retry')" />

    <slot v-if="loading && (!items || !items.length)" name="skeleton">
      <UiFeedback type="loading" :message="loadingMessage" />
    </slot>

    <template v-else>
      <section
        v-if="!isEmpty"
        class="media-grid"
        :class="[`media-grid--${variant}`, gridClass]"
        :aria-busy="loadingMore"
        aria-live="polite"
      >
        <slot />
      </section>

      <slot v-else name="empty">
        <UiEmptyState :message="emptyMessage" />
      </slot>

      <slot name="pagination">
        <InfiniteScrollTrigger
          :has-more="hasMore"
          :loading="loadingMore"
          @load="$emit('load-more')"
        />
      </slot>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import InfiniteScrollTrigger from '@/components/ui/InfiniteScrollTrigger.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

const props = withDefaults(
  defineProps<{
    items?: any[] | null;
    loading?: boolean;
    loadingMore?: boolean;
    hasMore?: boolean;
    error?: string;
    empty?: boolean | null;
    emptyMessage?: string;
    loadingMessage?: string;
    variant?: 'poster' | 'compact' | 'music' | string;
    gridClass?: string | Record<string, any> | any[];
  }>(),
  {
    items: null,
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: '',
    empty: null,
    emptyMessage: 'Aucun média ne correspond à ces critères.',
    loadingMessage: 'Chargement du catalogue…',
    variant: 'poster',
    gridClass: '',
  }
);

defineEmits<{
  (e: 'load-more'): void;
  (e: 'retry'): void;
}>();

const isEmpty = computed(() => {
  if (props.empty !== null) return props.empty;
  return props.items !== null && props.items.length === 0;
});
</script>

<style scoped lang="scss">
.media-grid-shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
}

.media-grid {
  display: grid;
  gap: var(--poster-grid-gap);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  padding: 6px 4px 14px;
  margin: -6px -4px -14px;
}

.media-grid > :deep(*) { content-visibility: auto; contain-intrinsic-size: 180px 280px; }

.media-grid--compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.media-grid--music {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (min-width: 640px) {
  .media-grid--poster {
    grid-template-columns: repeat(auto-fill, var(--poster-grid-min));
    justify-content: start;
  }
  .media-grid--compact { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .media-grid--music { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
}

@media (min-width: 1200px) {
  .media-grid--poster { gap: var(--poster-grid-gap); }
  .media-grid--compact { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  .media-grid--music { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}

</style>
