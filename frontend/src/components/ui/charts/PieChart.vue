<template>
  <div class="pie-chart">
    <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" role="img" :aria-label="ariaLabel">
      <!-- Un anneau plutot qu'un disque : le centre porte le total, et comparer des
           epaisseurs d'arc reste plus lisible que des pointes se rejoignant au milieu. -->
      <circle class="pie-track" :cx="C" :cy="C" :r="R" />
      <circle
        v-for="(slice, index) in slices"
        :key="slice.label"
        class="pie-slice"
        :class="{ interactive, dimmed: isDimmed(slice, index), selected: slice.label === selected }"
        :cx="C"
        :cy="C"
        :r="R"
        :stroke="slice.color"
        :stroke-dasharray="`${slice.length} ${CIRCUMFERENCE - slice.length}`"
        :stroke-dashoffset="slice.offset"
        :tabindex="interactive && !slice.grouped ? 0 : -1"
        :aria-label="`${slice.label} : ${slice.percentLabel} %`"
        @mouseenter="hovered = index"
        @mouseleave="hovered = null"
        @focus="hovered = index"
        @blur="hovered = null"
        @click="select(slice)"
        @keydown.enter.prevent="select(slice)"
        @keydown.space.prevent="select(slice)"
      />
      <text class="pie-center-value" :x="C" :y="C - 2">{{ centerValue }}</text>
      <text class="pie-center-label" :x="C" :y="C + 16">{{ centerLabel }}</text>
    </svg>

    <ul class="pie-legend">
      <li v-for="(slice, index) in slices" :key="slice.label">
        <button
          type="button"
          :disabled="!interactive || slice.grouped"
          :class="{ dimmed: isDimmed(slice, index), selected: slice.label === selected }"
          @mouseenter="hovered = index"
          @mouseleave="hovered = null"
          @click="select(slice)"
        >
          <i :style="{ background: slice.color }"></i>
          <span :title="slice.label">{{ slice.label }}</span>
          <strong>{{ formatNumber(slice.value) }}</strong>
          <small>{{ slice.percentLabel }} %</small>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/format';

export interface PieSlice {
  label: string;
  value: number | string;
  grouped?: boolean;
  rawValue?: any;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    items?: PieSlice[];
    interactive?: boolean;
    ariaLabel?: string;
    centerLabel?: string;
    /** Part actuellement retenue comme filtre : elle reste en avant, les autres reculent. */
    selected?: string;
  }>(),
  { items: () => [], interactive: false, ariaLabel: 'Répartition', centerLabel: 'total', selected: '' }
);

/* La part entiere est emise, pas seulement sa valeur : l'appelant decide ce qu'il
   en retient (libelle, `rawValue`...) sans que le camembert ait a le deviner. */
const emit = defineEmits<{ (e: 'select', slice: PieSlice): void }>();

const SIZE = 180;
const C = SIZE / 2;
const R = 70;
const CIRCUMFERENCE = 2 * Math.PI * R;

/* Une teinte par part, prise dans une roue fixe : les couleurs doivent rester les memes
   d'un rendu a l'autre pour que la legende soit memorisable. */
const PALETTE = ['#e5a00d', '#38bdf8', '#4ade80', '#c084fc', '#fb7185', '#facc15', '#2dd4bf', '#f97316', '#a3a3a3'];

const hovered = ref<number | null>(null);
const total = computed(() => props.items.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1);

const slices = computed(() => {
  let consumed = 0;
  return props.items.map((item, index) => {
    const share = Number(item.value || 0) / total.value;
    const length = share * CIRCUMFERENCE;
    // Le premier arc part du haut : `-consumed` fait tourner le trait dans le sens des
    // aiguilles, la rotation du SVG s'occupant du point de depart.
    const offset = -consumed;
    consumed += length;
    return {
      ...item,
      color: item.grouped ? '#6b7280' : PALETTE[index % PALETTE.length],
      length,
      offset,
      percentLabel: (share * 100).toFixed(share < 0.01 ? 2 : 1),
    };
  });
});

const centerValue = computed(() => formatNumber(total.value));

/* Le survol eclaire une part ; a defaut, c'est le filtre actif qui la designe. */
function isDimmed(slice: PieSlice, index: number): boolean {
  if (hovered.value !== null) return hovered.value !== index;
  return Boolean(props.selected) && slice.label !== props.selected;
}

function select(slice: PieSlice): void {
  if (props.interactive && !slice.grouped) emit('select', slice);
}
</script>

<style scoped lang="scss">
.pie-chart {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: var(--space-4);
  align-items: center;
  margin-top: 14px;
}
.pie-chart svg { width: 180px; height: 180px; transform: rotate(-90deg); }
.pie-track { fill: none; stroke: rgba(255, 255, 255, .07); stroke-width: 26; }
.pie-slice {
  fill: none;
  stroke-width: 26;
  transition: opacity .15s ease, stroke-width .15s ease;
  outline: none;
}
.pie-slice.interactive { cursor: pointer; }
.pie-slice.interactive:hover, .pie-slice.interactive:focus-visible { stroke-width: 30; }
.pie-slice.dimmed { opacity: .35; }
.pie-slice.selected { stroke-width: 30; }

/* Les deux textes du centre annulent la rotation du SVG, sinon ils s'affichent couches. */
.pie-center-value, .pie-center-label {
  transform: rotate(90deg);
  transform-origin: center;
  text-anchor: middle;
  fill: var(--text);
}
.pie-center-value { font-size: 20px; font-weight: 700; }
.pie-center-label { fill: var(--muted); font-size: 11px; }

.pie-legend {
  display: grid;
  gap: 2px;
  align-content: start;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
  max-height: 180px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.pie-legend button {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto auto;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
  padding: 4px 2px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--fs-xs);
  text-align: left;
  transition: opacity .15s ease;
}
.pie-legend button:not(:disabled) { cursor: pointer; }
.pie-legend button:not(:disabled):hover { background: var(--surface-2); }
.pie-legend button.dimmed { opacity: .45; }
.pie-legend button.selected { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.pie-legend i { width: 10px; height: 10px; border-radius: 3px; }
/* La legende porte le nom en blanc et la valeur en gras orange : c'est elle qu'on lit,
   pas les arcs, et le gris precedent la rendait secondaire alors qu'elle est le tableau
   de lecture du camembert. */
.pie-legend span { overflow: hidden; color: var(--text); text-overflow: ellipsis; white-space: nowrap; }
.pie-legend strong { color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
.pie-legend small { min-width: 48px; color: var(--muted); font-size: 11px; text-align: right; font-variant-numeric: tabular-nums; }

@media (max-width: 640px) {
  .pie-chart { grid-template-columns: minmax(0, 1fr); justify-items: center; }
  .pie-legend { width: 100%; }
}
</style>
