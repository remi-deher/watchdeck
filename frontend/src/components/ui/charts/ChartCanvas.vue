<template>
  <div class="chart-canvas" :style="{ height: `${height}px` }">
    <canvas ref="canvas" role="img" :aria-label="ariaLabel" :data-points="pointCount" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';
import type { ChartConfiguration } from 'chart.js';
import { Chart } from './chartJs';

const props = withDefaults(defineProps<{ config: ChartConfiguration; height?: number; ariaLabel?: string; pointCount?: number }>(), {
  height: 200, ariaLabel: 'Graphique', pointCount: 0,
});
const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

function render(): void {
  chart?.destroy();
  chart = null;
  if (!canvas.value || (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))) return;
  const context = canvas.value.getContext('2d');
  if (context) chart = new Chart(context, toRaw(props.config));
}

onMounted(render);
watch(() => props.config, render, { deep: true });
onBeforeUnmount(() => chart?.destroy());
defineExpose({ getChart: () => chart });
</script>

<style scoped>
.chart-canvas{position:relative;width:100%;min-width:0}.chart-canvas canvas{display:block;width:100%;height:100%}
</style>
