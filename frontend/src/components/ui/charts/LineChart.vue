<template>
  <div class="line-chart">
    <div v-if="zoomed" class="line-chart__head">
      <small>{{ visiblePoints[0]?.fullLabel }} → {{ visiblePoints[visiblePoints.length - 1]?.fullLabel }}</small>
      <button type="button" class="line-chart__reset" @click="resetZoom">Réinitialiser le zoom</button>
    </div>
    <div ref="plot" class="line-chart__plot" :style="{ height: `${height}px` }" @pointerdown="startSelection" @pointermove="moveSelection" @pointerup="endSelection" @pointerleave="cancelSelection" @dblclick="resetZoom">
      <ChartCanvas :config="config" :height="height" :aria-label="ariaLabel" :point-count="visiblePoints.length" />
      <div v-if="selection" class="line-chart__selection" :style="selectionStyle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ChartConfiguration, TooltipItem } from 'chart.js';
import ChartCanvas from './ChartCanvas.vue';
import { chartColor } from './chartJs';
import { formatInteger } from '@/utils/format';

export interface LinePoint { key?: string | number; label?: string; fullLabel?: string; value?: number; detail?: string }
const props = withDefaults(defineProps<{ points?: LinePoint[]; height?: number; unit?: string; ariaLabel?: string; color?: string }>(), {
  points: () => [], height: 200, unit: '', ariaLabel: 'Graphique', color: 'var(--accent)',
});
const plot = ref<HTMLElement | null>(null);
const range = ref<{ from: number; to: number } | null>(null);
const selection = ref<{ from: number; to: number } | null>(null);
watch(() => props.points, () => { range.value = null; selection.value = null; });
const visiblePoints = computed(() => {
  const points = props.points.map(point => ({ ...point, value: Number(point.value || 0) }));
  return range.value ? points.slice(range.value.from, range.value.to + 1) : points;
});
const zoomed = computed(() => range.value !== null);
const config = computed<ChartConfiguration<'line'>>(() => {
  const accent = chartColor(props.color);
  return {
    type: 'line',
    data: {
      labels: visiblePoints.value.map(point => point.label || ''),
      datasets: [{ data: visiblePoints.value.map(point => point.value), borderColor: accent, backgroundColor: `${accent}26`, borderWidth: 2, fill: true, tension: 0.25, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: accent }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        title: items => visiblePoints.value[items[0]?.dataIndex]?.fullLabel || items[0]?.label || '',
        label: (item: TooltipItem<'line'>) => `${formatInteger(Number(item.raw || 0))}${props.unit ? ` ${props.unit}` : ''}`,
        afterLabel: item => visiblePoints.value[item.dataIndex]?.detail || '',
      } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#a1a1aa', maxTicksLimit: 6, maxRotation: 0 } }, y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.08)' }, ticks: { color: '#a1a1aa', precision: 0 } } },
    },
  };
});
function fractionAt(event: PointerEvent | MouseEvent): number { const box = plot.value?.getBoundingClientRect(); return !box?.width ? 0 : Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)); }
function indexAt(fraction: number): number { return visiblePoints.value.length <= 1 ? 0 : Math.round(fraction * (visiblePoints.value.length - 1)); }
function startSelection(event: PointerEvent): void { if (event.button !== 0 || visiblePoints.value.length < 3) return; const fraction = fractionAt(event); selection.value = { from: fraction, to: fraction }; }
function moveSelection(event: PointerEvent): void { if (selection.value) selection.value = { ...selection.value, to: fractionAt(event) }; }
function endSelection(): void { const current = selection.value; selection.value = null; if (!current) return; const from = Math.min(current.from, current.to), to = Math.max(current.from, current.to); if (to - from < 0.02) return; const offset = range.value?.from ?? 0, first = offset + indexAt(from), last = offset + indexAt(to); if (last > first) range.value = { from: first, to: last }; }
function cancelSelection(): void { selection.value = null; }
function resetZoom(): void { range.value = null; selection.value = null; }
const selectionStyle = computed(() => selection.value ? { left: `${Math.min(selection.value.from, selection.value.to) * 100}%`, width: `${Math.abs(selection.value.to - selection.value.from) * 100}%` } : {});
</script>

<style scoped lang="scss">
.line-chart{display:grid;gap:4px;min-width:0}.line-chart__head{display:flex;align-items:center;justify-content:space-between;gap:var(--space-2)}.line-chart__head small{color:var(--muted);font-size:var(--fs-xs)}.line-chart__reset{padding:3px 10px;border:1px solid var(--border);border-radius:var(--radius-pill);background:var(--surface-2);color:var(--text);font:inherit;font-size:var(--fs-xs);cursor:pointer}.line-chart__plot{position:relative;min-width:0;cursor:crosshair;touch-action:pan-y}.line-chart__selection{position:absolute;inset-block:0;background:color-mix(in srgb,var(--accent) 16%,transparent);pointer-events:none}
</style>
