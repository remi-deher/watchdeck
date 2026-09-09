<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <span class="eyebrow">Capacité</span>
        <h2>{{ title }}</h2>
      </div>
      <strong class="peak">{{ peak }} au pic</strong>
    </div>
    <div v-if="daily.length" class="chart-content">
      <LineChart :points="chartPoints" unit="flux" :height="180" aria-label="Pic de lectures simultanées" />
    </div>
    <p v-else class="empty">Aucune simultanéité mesurable.</p>
    <footer v-if="peakAt">Pic observé le {{ formatDate(peakAt) }}</footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatDayMonth as shortDate, formatDateTime as formatDate } from '@/utils/format';
import LineChart from '@/components/ui/charts/LineChart.vue';
import { bucketDaily } from '@/utils/timeBuckets';

export interface ConcurrencyDailyPoint {
  date: string;
  peak?: number;
}

const props = withDefaults(
  defineProps<{
    daily?: ConcurrencyDailyPoint[];
    peak?: number;
    peakAt?: string;
  }>(),
  {
    daily: () => [],
    peak: 0,
    peakAt: '',
  }
);

/* Le regroupement retient le maximum et non la somme : deux flux simultanés lundi et
   deux mardi ne font pas quatre flux dans la semaine. */
const bucketed = computed(() =>
  bucketDaily(
    props.daily.map((point) => ({ date: point.date, value: Number(point.peak || 0) })),
    { aggregate: 'max', shortDate }
  )
);

const title = computed(
  () =>
    ({
      day: 'Lectures simultanées',
      week: 'Lectures simultanées (pic hebdomadaire)',
      month: 'Lectures simultanées (pic mensuel)',
    })[bucketed.value.grain]
);

const chartPoints = computed(() =>
  bucketed.value.points.map((point) => ({ ...point, detail: `${point.value} flux simultané(s)` }))
);
</script>

<style scoped lang="scss">
.peak {
  color: var(--text);
  font-size: var(--fs-sm);
}
.chart-content {
  margin-top: 14px;
}
.panel > footer {
  margin-top: 10px;
  color: var(--muted);
  font-size: var(--fs-xs);
}
</style>
