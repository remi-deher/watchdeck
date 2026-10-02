<template>
  <section class="panel span-two">
    <div class="panel-head">
      <div>
        <span class="eyebrow">Tendance</span>
        <h2>{{ title }}</h2>
      </div>
      <small v-if="totalSessions">{{ totalSessions }} lecture(s) au total</small>
    </div>
    <div v-if="points.length" class="chart-content">
      <LineChart :points="chartPoints" unit="session(s)" :height="200" aria-label="Lectures par période" />
      <p class="chart-hint">Glissez sur la courbe pour zoomer sur une plage ; double-clic pour revenir.</p>
    </div>
    <p v-else class="empty">Aucune lecture sur cette période.</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatDayMonth as shortDate } from '@/utils/format';
import LineChart from '@/components/ui/charts/LineChart.vue';
import { bucketDaily } from '@/utils/timeBuckets';

export interface DailyActivityPoint {
  date: string;
  sessions?: number;
}

const props = withDefaults(
  defineProps<{
    points?: DailyActivityPoint[];
  }>(),
  {
    points: () => [],
  }
);

const totalSessions = computed(() => {
  return props.points.reduce((sum, pt) => sum + Number(pt.sessions || 0), 0);
});

const bucketed = computed(() =>
  bucketDaily(
    props.points.map((point) => ({ date: point.date, value: Number(point.sessions || 0) })),
    { aggregate: 'sum', shortDate }
  )
);

const title = computed(
  () =>
    ({ day: 'Lectures quotidiennes', week: 'Lectures hebdomadaires', month: 'Lectures mensuelles' })[
      bucketed.value.grain
    ]
);

const chartPoints = computed(() =>
  bucketed.value.points.map((point) => ({ ...point, detail: `${point.value} session(s)` }))
);
</script>

<style scoped lang="scss">
.chart-content {
  margin-top: 14px;
}
.chart-hint {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: var(--fs-xs);
}
.panel-head small {
  color: var(--muted);
  font-size: var(--fs-xs);
}
</style>
