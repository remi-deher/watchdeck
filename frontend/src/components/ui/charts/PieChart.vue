<template>
  <div class="pie-chart">
    <div class="pie-visual">
      <ChartCanvas :config="config" :height="180" :aria-label="ariaLabel" :point-count="slices.length" />
      <div class="pie-center"><strong>{{ centerValue }}</strong><span>{{ centerLabel }}</span></div>
    </div>
    <ul class="pie-legend">
      <li v-for="(slice, index) in slices" :key="slice.label">
        <button type="button" :disabled="!interactive || slice.grouped" :class="{ dimmed: isDimmed(slice, index), selected: slice.label === selected }" @mouseenter="hovered=index" @mouseleave="hovered=null" @focus="hovered=index" @blur="hovered=null" @click="select(slice)">
          <i :style="{ background: slice.color }" /><span :title="slice.label">{{ slice.label }}</span><strong>{{ formatNumber(slice.value) }}</strong><small>{{ slice.percentLabel }} %</small>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ChartConfiguration, ChartEvent, ActiveElement } from 'chart.js';
import ChartCanvas from './ChartCanvas.vue';
import { chartPalette } from './chartJs';
import { formatNumber } from '@/utils/format';

export interface PieSlice { label: string; value: number | string; grouped?: boolean; rawValue?: any; [key: string]: any }
const props = withDefaults(defineProps<{ items?: PieSlice[]; interactive?: boolean; ariaLabel?: string; centerLabel?: string; selected?: string }>(), {
  items: () => [], interactive: false, ariaLabel: 'Répartition', centerLabel: 'total', selected: '',
});
const emit = defineEmits<{ (e: 'select', slice: PieSlice): void }>();
const hovered = ref<number | null>(null);
const total = computed(() => props.items.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1);
const slices = computed(() => props.items.map((item, index) => {
  const share = Number(item.value || 0) / total.value;
  return { ...item, color: item.grouped ? '#6b7280' : chartPalette[index % chartPalette.length], percentLabel: (share * 100).toFixed(share < 0.01 ? 2 : 1) };
}));
const centerValue = computed(() => formatNumber(total.value));
function isDimmed(slice: PieSlice, index: number): boolean { return hovered.value !== null ? hovered.value !== index : Boolean(props.selected) && slice.label !== props.selected; }
function select(slice: PieSlice): void { if (props.interactive && !slice.grouped) emit('select', slice); }
function chartClick(_event: ChartEvent, elements: ActiveElement[]): void { const slice = slices.value[elements[0]?.index]; if (slice) select(slice); }
const config = computed<ChartConfiguration<'doughnut'>>(() => ({
  type: 'doughnut',
  data: { labels: slices.value.map(slice => slice.label), datasets: [{ data: slices.value.map(slice => Number(slice.value || 0)), backgroundColor: slices.value.map(slice => props.selected && slice.label !== props.selected ? `${slice.color}59` : slice.color), borderWidth: 0, hoverOffset: props.interactive ? 5 : 0 }] },
  options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '72%', onClick: chartClick, onHover: (_event, elements) => { hovered.value = elements[0]?.index ?? null; }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => `${item.label}: ${formatNumber(Number(item.raw || 0))}` } } } },
}));
</script>

<style scoped lang="scss">
.pie-chart{display:grid;grid-template-columns:180px minmax(0,1fr);gap:var(--space-4);align-items:center;margin-top:14px}.pie-visual{position:relative;width:180px;height:180px}.pie-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}.pie-center strong{font-size:20px}.pie-center span{color:var(--muted);font-size:var(--fs-xs)}.pie-legend{display:grid;gap:2px;align-content:start;min-width:0;max-height:180px;margin:0;padding:0;overflow-y:auto;list-style:none;scrollbar-width:thin}.pie-legend button{display:grid;grid-template-columns:10px minmax(0,1fr) auto auto;gap:var(--space-2);align-items:center;width:100%;padding:4px 2px;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--text);font:inherit;font-size:var(--fs-xs);text-align:left;transition:opacity var(--motion-duration-instant) var(--motion-ease-standard)}.pie-legend button:not(:disabled){cursor:pointer}.pie-legend button:not(:disabled):hover{background:var(--surface-2)}.pie-legend button.dimmed{opacity:.45}.pie-legend button.selected{background:color-mix(in srgb,var(--accent) 14%,transparent)}.pie-legend i{width:10px;height:10px;border-radius: var(--radius-xs)}.pie-legend span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pie-legend strong{color:var(--accent);font-variant-numeric:tabular-nums}.pie-legend small{min-width:48px;color:var(--muted);font-size:var(--fs-xs);text-align:right;font-variant-numeric:tabular-nums}@media(max-width:640px){.pie-chart{grid-template-columns:minmax(0,1fr);justify-items:center}.pie-legend{width:100%}}
</style>
