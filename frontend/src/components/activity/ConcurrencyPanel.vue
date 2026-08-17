<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <span class="eyebrow">Capacité</span>
        <h2>Lectures simultanées</h2>
      </div>
      <strong class="peak">{{ peak }} au pic</strong>
    </div>
    <div v-if="daily.length" class="chart-content">
      <BarChart
        :points="chartPoints"
        unit="flux"
        :height="180"
        show-peak
      />
    </div>
    <p v-else class="empty">Aucune simultanéité mesurable.</p>
    <footer v-if="peakAt">Pic observé le {{ formatDate(peakAt) }}</footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatDayMonth as shortDate, formatDateTime as formatDate } from '@/utils/format';
import BarChart from '@/components/ui/charts/BarChart.vue';

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

const chartPoints = computed(() => {
  return props.daily.map((p) => ({
    key: p.date,
    label: shortDate(p.date),
    fullLabel: p.date,
    value: p.peak || 0,
    detail: `${p.peak || 0} flux simultané(s)`,
  }));
});
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
