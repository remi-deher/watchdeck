<template>
  <section class="discover-sources" :aria-labelledby="headingId">
    <header class="rail-header">
      <div class="rail-heading">
        <h2 :id="headingId" class="rail-title">{{ title }}</h2>
      </div>
    </header>
    <MediaRailSkeleton v-if="loading" :count="skeletonCount" />
    <UiFeedback v-else-if="error" type="error" :message="error" retry @retry="emit('retry')" />
    <div v-else class="horizontal-rail-shell">
      <div ref="track" class="source-track">
        <DiscoverSourceCard
          v-for="source in sources"
          :key="`${source.kind}:${source.id}`"
          :source="source"
          :to="sourcePath(source)"
        />
      </div>
      <RailEdgeControls :can-left="state.canLeft" :can-right="state.canRight" @scroll="scroll" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DiscoverSourceCard from '@/components/discover/DiscoverSourceCard.vue';
import type { DiscoverSource } from '@/components/discover/DiscoverSourceCard.vue';
import MediaRailSkeleton from '@/components/discover/MediaRailSkeleton.vue';
import RailEdgeControls from '@/components/ui/RailEdgeControls.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import { useHorizontalRail } from '@/composables/useHorizontalRail';

withDefaults(defineProps<{
  title: string;
  headingId: string;
  sources: DiscoverSource[];
  sourcePath: (source: DiscoverSource) => string | Record<string, any>;
  loading?: boolean;
  error?: string;
  skeletonCount?: number;
}>(), {
  loading: false,
  error: '',
  skeletonCount: 6,
});

const emit = defineEmits<{ retry: [] }>();
const track = ref<HTMLElement | null>(null);
const { state, scroll } = useHorizontalRail(track);
</script>

<style scoped lang="scss">
.discover-sources { display: grid; gap: var(--space-3); min-width: 0; }
.rail-header { display: flex; align-items: end; justify-content: space-between; gap: var(--space-4); }
.rail-heading { display: grid; gap: 3px; }
.rail-title { margin: 0; color: inherit; font-size: var(--fs-lg); font-weight: 750; line-height: 1.2; }
.horizontal-rail-shell { position: relative; min-width: 0; }
.source-track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: clamp(100px, 12vw, 130px);
  gap: var(--space-3);
  padding: 8px 8px 14px;
  margin: -6px -8px -10px;
  overflow-x: auto;
  scrollbar-width: none;
}
.source-track::-webkit-scrollbar { display: none; }
:deep(.media-rail-skeleton) { grid-auto-columns: clamp(100px, 12vw, 130px); gap: var(--space-3); }
:deep(.skeleton-poster) { aspect-ratio: 1 / 1; }
@media (max-width: 720px) {
  .source-track { grid-auto-columns: minmax(88px, 26vw); margin-right: -12px; }
  :deep(.media-rail-skeleton) { grid-auto-columns: minmax(88px, 26vw); }
}
</style>
