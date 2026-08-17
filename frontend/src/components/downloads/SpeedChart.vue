<template>
  <div class="speed-chart-container" title="Bande passante en temps réel (30 derniers relevés)">
    <svg :viewBox="`0 0 ${width} ${height}`" class="speed-chart-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="dl-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0" />
        </linearGradient>
        <linearGradient id="up-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--success)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--success)" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Shaded Areas -->
      <path v-if="dlAreaPath" :d="dlAreaPath" fill="url(#dl-gradient)" />
      <path v-if="upAreaPath" :d="upAreaPath" fill="url(#up-gradient)" />

      <!-- Lines -->
      <path v-if="dlLinePath" :d="dlLinePath" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" />
      <path v-if="upLinePath" :d="upLinePath" fill="none" stroke="var(--success)" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface SpeedPoint { dl: number; up: number; }

const props = withDefaults(
  defineProps<{
    downloadSpeed?: number;
    uploadSpeed?: number;
    maxPoints?: number;
  }>(),
  { downloadSpeed: 0, uploadSpeed: 0, maxPoints: 30 }
);

const width = 180;
const height = 36;

const history = ref<SpeedPoint[]>(Array.from({ length: 15 }, () => ({ dl: 0, up: 0 })));

watch(
  () => [props.downloadSpeed, props.uploadSpeed],
  ([dl, up]) => {
    const next = [...history.value, { dl, up }];
    if (next.length > props.maxPoints) next.shift();
    history.value = next;
  },
  { immediate: true }
);

const maxVal = computed(() => {
  let peak = 1024 * 100;
  history.value.forEach((pt) => {
    if (pt.dl > peak) peak = pt.dl;
    if (pt.up > peak) peak = pt.up;
  });
  return peak;
});

function buildPaths(key: 'dl' | 'up'): { line: string; area: string } {
  const pts = history.value;
  if (!pts.length) return { line: '', area: '' };
  const stepX = width / Math.max(pts.length - 1, 1);
  const points = pts.map((pt, i) => {
    const val = pt[key] || 0;
    const y = height - (val / maxVal.value) * (height - 4) - 2;
    const x = i * stepX;
    return { x, y };
  });
  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = `${lineD} L ${width},${height} L 0,${height} Z`;
  return { line: lineD, area: areaD };
}

const dlLinePath = computed(() => buildPaths('dl').line);
const dlAreaPath = computed(() => buildPaths('dl').area);
const upLinePath = computed(() => buildPaths('up').line);
const upAreaPath = computed(() => buildPaths('up').area);
</script>

<style scoped lang="scss">
.speed-chart-container {
  width: 180px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface-2) 60%, transparent);
  padding: 2px;
  overflow: hidden;
}
.speed-chart-svg {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
