<template>
  <div class="horizontal-bar-chart" role="list">
    <div
      v-for="item in normalizedItems"
      :key="item.label"
      class="hbar-row"
      :class="{ 'is-interactive': interactive && !item.disabled }"
      role="listitem"
      @click="onSelect(item)"
    >
      <div class="hbar-header">
        <div class="hbar-label-group">
          <span class="hbar-label" :title="item.label">{{ item.label }}</span>
          <small v-if="item.detail" class="hbar-detail">{{ item.detail }}</small>
        </div>
        <div class="hbar-stats">
          <strong class="hbar-value">{{ formatValue(item.value) }}<small v-if="item.suffix">{{ item.suffix }}</small></strong>
          <span v-if="showPercentage" class="hbar-percent">{{ item.percent.toFixed(1) }} %</span>
        </div>
      </div>
      <div class="hbar-track">
        <div
          class="hbar-fill"
          :style="{ width: `${item.width}%`, background: barColor }"
        ></div>
      </div>
    </div>
    <p v-if="!normalizedItems.length" class="hbar-empty">{{ emptyText }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber } from '@/utils/format';

export interface HorizontalBarItem {
  label: string;
  value: number | string;
  detail?: string;
  suffix?: string;
  disabled?: boolean;
  rawValue?: any;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    items?: HorizontalBarItem[];
    barColor?: string;
    showPercentage?: boolean;
    interactive?: boolean;
    emptyText?: string;
    customFormat?: ((v: any) => string) | null;
  }>(),
  {
    items: () => [],
    barColor: 'linear-gradient(90deg, var(--accent), #fbbf24)',
    showPercentage: true,
    interactive: false,
    emptyText: 'Aucune donnée disponible.',
    customFormat: null,
  }
);

const emit = defineEmits<{
  (e: 'select', value: any): void;
}>();

const total = computed(() => {
  return props.items.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
});

const maxValue = computed(() => {
  return Math.max(1, ...props.items.map((item) => Number(item.value || 0)));
});

const normalizedItems = computed(() => {
  const max = maxValue.value;
  const tot = total.value;
  return props.items.map((item) => {
    const val = Number(item.value || 0);
    return {
      ...item,
      value: val,
      percent: (val / tot) * 100,
      width: Math.max(val > 0 ? 3 : 0, (val / max) * 100),
    };
  });
});

function formatValue(v: any): string {
  if (props.customFormat) return props.customFormat(v);
  return formatNumber(v);
}

function onSelect(item: any): void {
  if (props.interactive && !item.disabled) {
    emit('select', item.rawValue ?? item.label);
  }
}
</script>

<style scoped lang="scss">
.horizontal-bar-chart {
  display: grid;
  gap: var(--space-3);
  width: 100%;
}

.hbar-row {
  display: grid;
  gap: 5px;
  width: 100%;
}

.hbar-row.is-interactive {
  cursor: pointer;
  padding: 4px 6px;
  margin: -4px -6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.hbar-row.is-interactive:hover {
  background: var(--surface-2);
}

.hbar-row.is-interactive:hover .hbar-label {
  color: var(--accent);
}

.hbar-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--fs-xs);
}

.hbar-label-group {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.hbar-label {
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hbar-detail {
  color: var(--muted);
  font-size: 11px;
}

.hbar-stats {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-shrink: 0;
}

.hbar-value {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.hbar-value small {
  color: var(--muted);
  font-weight: normal;
  margin-left: 2px;
}

.hbar-percent {
  color: var(--muted);
  font-size: 11px;
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.hbar-track {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  border: 1px solid var(--border);
  overflow: hidden;
}

.hbar-fill {
  height: 100%;
  border-radius: inherit;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.hbar-empty {
  color: var(--muted);
  font-size: var(--fs-xs);
  margin: 0;
  padding: 12px 0;
  text-align: center;
}
</style>
