<template>
  <div class="sparkline-container" :class="{ 'has-points': points.length > 1 }" :style="{ height: `${height}px`, width: width ? `${width}px` : '100%' }">
    <svg v-if="points.length > 1" :viewBox="`0 0 ${viewWidth} ${height}`" class="sparkline-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.3" />
          <stop offset="100%" :stop-color="color" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      <path v-if="areaPath && showArea" :d="areaPath" :fill="`url(#${gradientId})`" />
      <path :d="linePath" fill="none" :stroke="color" :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round" />
      <circle v-if="showLastDot && lastPoint" :cx="lastPoint.x" :cy="lastPoint.y" :r="strokeWidth * 1.5" :fill="color" />
    </svg>
    <div v-else class="sparkline-empty"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    points?: Array<number | { value?: number; y?: number; [key: string]: any }>;
    color?: string;
    height?: number;
    width?: number;
    strokeWidth?: number;
    showArea?: boolean;
    showLastDot?: boolean;
  }>(),
  {
    points: () => [],
    color: 'var(--accent)',
    height: 32,
    width: 0,
    strokeWidth: 1.8,
    showArea: true,
    showLastDot: true,
  }
);

const generatedId = useId ? useId() : Math.random().toString(36).substring(2, 9);
const gradientId = computed(() => `sparkline-grad-${generatedId}`);
const viewWidth = 120;

const normalizedPoints = computed(() => {
  const pts = props.points;
  if (!pts || pts.length < 2) return [];
  const numPts = pts.map((p) => (typeof p === 'number' ? p : Number(p.value ?? p.y ?? 0)));
  const min = Math.min(...numPts);
  const max = Math.max(...numPts);
  const range = max - min || 1;
  const stepX = viewWidth / (numPts.length - 1);
  const padding = props.strokeWidth + 2;
  const availHeight = props.height - padding * 2;

  return numPts.map((val, idx) => {
    const x = idx * stepX;
    const y = props.height - padding - ((val - min) / range) * availHeight;
    return { x, y, value: val };
  });
});

const linePath = computed(() => {
  const pts = normalizedPoints.value;
  if (pts.length < 2) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
});

const areaPath = computed(() => {
  const pts = normalizedPoints.value;
  if (pts.length < 2) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `M ${first.x.toFixed(1)},${first.y.toFixed(1)} ${pts.slice(1).map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L ${last.x.toFixed(1)},${props.height} L ${first.x.toFixed(1)},${props.height} Z`;
});

const lastPoint = computed(() => {
  const pts = normalizedPoints.value;
  return pts.length ? pts[pts.length - 1] : null;
});
</script>

<style scoped lang="scss">
.sparkline-container {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
}
.sparkline-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.sparkline-empty {
  width: 100%;
  height: 1px;
  background: var(--border);
}
</style>
