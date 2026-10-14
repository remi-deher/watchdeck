<template>
  <PanelCard title="Répartition des demandes">
    <div class="breakdown-grid">
      <RequestBreakdownItem kind="movie" label="Films" :counts="counts.by_type?.movie"><template #icon><Film /></template></RequestBreakdownItem>
      <RequestBreakdownItem kind="show" label="Séries" :counts="counts.by_type?.show"><template #icon><Tv /></template></RequestBreakdownItem>
    </div>
    <div v-if="counts.total" class="type-ratio-bar">
      <div
        class="ratio-segment movie-seg"
        :style="{ width: `${((counts.by_type?.movie?.total ?? 0) / counts.total) * 100}%` }"
        :title="`Films : ${counts.by_type?.movie?.total ?? 0}`"
      ></div>
      <div
        class="ratio-segment show-seg"
        :style="{ width: `${((counts.by_type?.show?.total ?? 0) / counts.total) * 100}%` }"
        :title="`Séries : ${counts.by_type?.show?.total ?? 0}`"
      ></div>
    </div>
  </PanelCard>
</template>

<script setup lang="ts">
import { Film, Tv } from '@lucide/vue';
import PanelCard from '@/components/ui/PanelCard.vue';
import RequestBreakdownItem from './RequestBreakdownItem.vue';

export interface RequestTypeCount {
  total?: number;
  available?: number;
  sent_to_arr?: number;
  failed?: number;
}

export interface RequestCounts {
  total?: number;
  by_type?: {
    movie?: RequestTypeCount;
    show?: RequestTypeCount;
    [key: string]: RequestTypeCount | undefined;
  };
  [key: string]: any;
}

withDefaults(
  defineProps<{
    counts?: RequestCounts;
  }>(),
  {
    counts: () => ({}),
  }
);
</script>

<style scoped lang="scss">
/* --- Breakdown Cards (Films vs Séries) --- */
.breakdown-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-bottom: 14px;
}

.type-ratio-bar {
  display: flex;
  height: 6px;
  border-radius: var(--radius-xs);
  overflow: hidden;
  gap: var(--space-1);
  margin-top: 4px;
}

.ratio-segment {
  height: 100%;
  border-radius: var(--radius-xs);
  transition: width var(--motion-duration-base) var(--motion-ease-standard);
}

.ratio-segment.movie-seg { background: var(--accent-gradient); }

.ratio-segment.show-seg { background: var(--blue); }
</style>
