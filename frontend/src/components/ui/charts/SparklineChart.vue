<template>
  <div class="sparkline-container" :style="{ height: `${height}px`, width: width ? `${width}px` : '100%' }">
    <ChartCanvas v-if="values.length > 1" :config="config" :height="height" aria-label="Tendance" :point-count="values.length" />
    <div v-else class="sparkline-empty" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChartConfiguration } from 'chart.js';
import ChartCanvas from './ChartCanvas.vue';
import { chartColor } from './chartJs';

const props = withDefaults(defineProps<{ points?: Array<number | { value?: number; y?: number; [key: string]: any }>; color?: string; height?: number; width?: number; strokeWidth?: number; showArea?: boolean; showLastDot?: boolean }>(), {
  points: () => [], color: 'var(--accent)', height: 32, width: 0, strokeWidth: 1.8, showArea: true, showLastDot: true,
});
const values = computed(() => props.points.map(point => typeof point === 'number' ? point : Number(point.value ?? point.y ?? 0)));
const config = computed<ChartConfiguration<'line'>>(() => {
  const accent = chartColor(props.color);
  return { type: 'line', data: { labels: values.value.map((_, index) => index), datasets: [{ data: values.value, borderColor: accent, backgroundColor: `${accent}26`, borderWidth: props.strokeWidth, fill: props.showArea, tension: 0.3, pointRadius: values.value.map((_, index) => props.showLastDot && index === values.value.length - 1 ? props.strokeWidth * 1.5 : 0), pointBackgroundColor: accent }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, events: [], plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } } };
});
</script>

<style scoped>
.sparkline-container{display:inline-flex;align-items:center;overflow:hidden}.sparkline-container :deep(.chart-canvas){flex:1}.sparkline-empty{width:100%;height:1px;background:var(--border)}
</style>
