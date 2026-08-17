<template>
  <div class="bar-chart-container" :style="{ height: `${height}px` }">
    <!-- Axe Y optionnel -->
    <div v-if="showYAxis" class="bar-chart-y-axis">
      <span>{{ formatNumber(maxVal) }}</span>
      <span>{{ formatNumber(Math.round(maxVal / 2)) }}</span>
      <span>0</span>
    </div>

    <!-- Zone principale de graphique -->
    <div class="bar-chart-area" :class="{ 'has-scroll': enableScroll }">
      <div
        v-for="(point, index) in normalizedData"
        :key="point.key || index"
        class="bar-item"
        :class="{ 'is-hovered': hoveredIndex === index, 'is-peak': showPeak && point.value === maxVal && point.value > 0 }"
        @mouseenter="hoveredIndex = index"
        @mouseleave="hoveredIndex = null"
        @focus="hoveredIndex = index"
        @blur="hoveredIndex = null"
        tabindex="0"
        role="img"
        :aria-label="`${point.label} : ${point.value} ${unit}`"
      >
        <!-- Infobulle flottante au survol -->
        <div v-if="hoveredIndex === index" class="bar-tooltip" role="tooltip">
          <div class="tooltip-label">{{ point.fullLabel || point.label }}</div>
          <div class="tooltip-value">
            <strong>{{ formatNumber(point.value) }}</strong>
            <span v-if="unit">{{ unit }}</span>
          </div>
          <div v-if="point.detail" class="tooltip-detail">{{ point.detail }}</div>
        </div>

        <!-- Valeur au-dessus si barre courte -->
        <div v-if="showValues && point.value > 0 && point.ratio < 0.18" class="bar-val-top">
          {{ formatNumber(point.value) }}
        </div>

        <!-- Barre verticale -->
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{ height: `${Math.max(point.value > 0 ? 3 : 0, point.ratio * 100)}%`, background: barColor }"
          >
            <span v-if="showValues && point.value > 0 && point.ratio >= 0.18" class="bar-val-inside">
              {{ formatNumber(point.value) }}
            </span>
          </div>
        </div>

        <!-- Libellé de l'axe X -->
        <div v-if="showLabels && (shouldShowLabel(index) || hoveredIndex === index)" class="bar-label">
          {{ point.label }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatInteger as formatNumber } from '@/utils/format';

export interface BarChartPoint {
  value?: number;
  sessions?: number;
  count?: number;
  label?: string;
  fullLabel?: string;
  date?: string;
  detail?: string;
  key?: string | number;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    points?: Array<number | BarChartPoint>;
    height?: number;
    unit?: string;
    barColor?: string;
    showYAxis?: boolean;
    showLabels?: boolean;
    showValues?: boolean;
    showPeak?: boolean;
    enableScroll?: boolean;
    labelInterval?: number;
  }>(),
  {
    points: () => [],
    height: 220,
    unit: '',
    barColor: 'linear-gradient(180deg, var(--accent), #e5a00d)',
    showYAxis: true,
    showLabels: true,
    showValues: true,
    showPeak: false,
    enableScroll: false,
    labelInterval: 0,
  }
);

const hoveredIndex = ref<number | null>(null);

const rawValues = computed(() => {
  return props.points.map((p) => {
    if (typeof p === 'number') return p;
    return Number(p.value ?? p.sessions ?? p.count ?? 0);
  });
});

const maxVal = computed(() => {
  const vals = rawValues.value;
  return Math.max(1, ...vals);
});

const normalizedData = computed(() => {
  const max = maxVal.value;
  return props.points.map((p, idx) => {
    const isNum = typeof p === 'number';
    const val = isNum ? p : Number(p.value ?? p.sessions ?? p.count ?? 0);
    const label = isNum ? `#${idx + 1}` : p.label ?? p.date ?? `#${idx + 1}`;
    const fullLabel = !isNum ? p.fullLabel ?? p.date ?? label : label;
    const detail = !isNum ? p.detail : '';
    const key = !isNum ? p.key ?? p.date ?? idx : idx;

    return {
      key,
      value: val,
      ratio: max > 0 ? val / max : 0,
      label,
      fullLabel,
      detail,
    };
  });
});

function shouldShowLabel(index: number): boolean {
  const total = normalizedData.value.length;
  if (props.labelInterval > 0) {
    return index % props.labelInterval === 0 || index === total - 1;
  }
  if (total <= 10) return true;
  if (total <= 16) return index % 2 === 0 || index === total - 1;
  if (total <= 32) return index % 4 === 0 || index === total - 1;
  return index % 7 === 0 || index === total - 1;
}
</script>

<style scoped lang="scss">
.bar-chart-container {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
  width: 100%;
  position: relative;
}

.bar-chart-y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  min-width: 32px;
  padding-bottom: 22px;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.bar-chart-area {
  display: flex;
  align-items: flex-end;
  gap: var(--space-1);
  flex: 1;
  height: 100%;
  padding-bottom: 22px;
  position: relative;
}

.bar-chart-area.has-scroll {
  overflow-x: auto;
  padding-bottom: 26px;
}

.bar-item {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  flex: 1;
  min-width: 14px;
  height: 100%;
  cursor: pointer;
  outline: none;
}

.bar-track {
  width: 100%;
  max-width: 36px;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  position: relative;
}

.bar-fill {
  width: 100%;
  min-height: 2px;
  border-radius: var(--radius-xs) var(--radius-xs) 2px 2px;
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s ease;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 2px;
}

.bar-item:hover .bar-fill,
.bar-item:focus .bar-fill {
  filter: brightness(1.2);
}

.bar-item.is-peak .bar-fill {
  box-shadow: 0 0 8px rgba(229, 160, 13, 0.4);
}

.bar-val-top {
  position: absolute;
  top: -18px;
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
  white-space: nowrap;
}

.bar-val-inside {
  font-size: 10px;
  font-weight: 700;
  color: #111;
  line-height: 1;
  user-select: none;
}

.bar-label {
  position: absolute;
  bottom: -22px;
  font-size: var(--fs-xs);
  color: var(--muted);
  white-space: nowrap;
  user-select: none;
}

.bar-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: var(--fs-xs);
  color: var(--text);
  white-space: nowrap;
  z-index: 20;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.tooltip-label {
  font-size: 10px;
  color: var(--muted);
  font-weight: 500;
}

.tooltip-value {
  display: flex;
  gap: 4px;
  align-items: baseline;
}

.tooltip-value strong {
  font-size: var(--fs-sm);
  color: var(--accent);
}

.tooltip-detail {
  font-size: 10px;
  color: var(--muted);
}

@media (max-width: 640px) {
  .bar-chart-area {
    gap: 3px;
  }
  .bar-item {
    min-width: 10px;
  }
}
</style>
