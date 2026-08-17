<template>
  <section class="panel span-two">
    <div class="panel-head">
      <div>
        <span class="eyebrow">Tendance</span>
        <h2>Lectures quotidiennes</h2>
      </div>
      <small v-if="totalSessions">{{ totalSessions }} lecture(s) au total</small>
    </div>
    <div v-if="points.length" class="chart-content">
      <BarChart
        :points="chartPoints"
        unit="session(s)"
        :height="200"
        show-peak
      />
    </div>
    <p v-else class="empty">Aucune lecture sur cette période.</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatDayMonth as shortDate } from '@/utils/format';
import BarChart from '@/components/ui/charts/BarChart.vue';

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

const chartPoints = computed(() => {
  return props.points.map((p) => ({
    key: p.date,
    label: shortDate(p.date),
    fullLabel: p.date,
    value: p.sessions || 0,
    detail: `${p.sessions || 0} session(s)`,
  }));
});
</script>

<style scoped lang="scss">
.chart-content {
  margin-top: 14px;
}
.panel-head small {
  color: var(--muted);
  font-size: var(--fs-xs);
}
</style>
