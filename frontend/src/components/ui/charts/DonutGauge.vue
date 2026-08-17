<template>
  <div class="donut-gauge-container" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :viewBox="`0 0 ${size} ${size}`" class="donut-svg">
      <!-- Cercle de fond -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        stroke="var(--surface-2)"
        :stroke-width="strokeWidth"
      />
      <!-- Arc de progression -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        :transform="`rotate(-90 ${center} ${center})`"
        class="donut-progress"
      />
    </svg>
    <div class="donut-content">
      <strong class="donut-value">{{ displayPercent }}%</strong>
      <span v-if="label" class="donut-label">{{ label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    value?: number;
    max?: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    label?: string;
  }>(),
  {
    value: 0,
    max: 100,
    size: 68,
    strokeWidth: 6,
    color: 'var(--accent)',
    label: '',
  }
);

const center = computed(() => props.size / 2);
const radius = computed(() => (props.size - props.strokeWidth) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);

const ratio = computed(() => {
  if (props.max <= 0) return 0;
  return Math.min(1, Math.max(0, props.value / props.max));
});

const displayPercent = computed(() => Math.round(ratio.value * 100));

const dashOffset = computed(() => {
  return circumference.value * (1 - ratio.value);
});
</script>

<style scoped lang="scss">
.donut-gauge-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.donut-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.donut-progress {
  transition: stroke-dashoffset 0.4s ease;
}

.donut-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  pointer-events: none;
}

.donut-value {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.donut-label {
  font-size: 9px;
  color: var(--muted);
  margin-top: 2px;
}
</style>
