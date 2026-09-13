<template>
  <div class="line-chart">
    <div class="line-chart__head" v-if="zoomed">
      <small>{{ visiblePoints[0]?.fullLabel }} → {{ visiblePoints[visiblePoints.length - 1]?.fullLabel }}</small>
      <button type="button" class="line-chart__reset" @click="resetZoom">Réinitialiser le zoom</button>
    </div>

    <div class="line-chart__body" :style="{ height: `${height}px` }">
      <div class="line-chart__y" aria-hidden="true">
        <span>{{ formatNumber(maxVal) }}</span>
        <span>{{ formatNumber(Math.round(maxVal / 2)) }}</span>
        <span>0</span>
      </div>

      <div
        ref="plot"
        class="line-chart__plot"
        :style="{ '--line-color': color }"
        @pointerdown="startSelection"
        @pointermove="onMove"
        @pointerup="endSelection"
        @pointerleave="onLeave"
        @dblclick="resetZoom"
      >
        <svg :viewBox="`0 0 ${VB_W} ${VB_H}`" preserveAspectRatio="none" role="img" :aria-label="ariaLabel">
          <!-- Trois repères horizontaux : sans axe, une courbe ne se lit pas. -->
          <line v-for="ratio in [0, 0.5, 1]" :key="ratio" class="grid" x1="0" :x2="VB_W" :y1="ratio * VB_H" :y2="ratio * VB_H" vector-effect="non-scaling-stroke" />
          <path v-if="areaPath" class="area" :d="areaPath" />
          <path v-if="linePath" class="line" :d="linePath" vector-effect="non-scaling-stroke" />
          <circle
            v-if="hovered"
            class="dot"
            :cx="hovered.x"
            :cy="hovered.y"
            r="4"
            vector-effect="non-scaling-stroke"
          />
          <rect
            v-if="selection"
            class="selection"
            :x="Math.min(selection.from, selection.to) * VB_W"
            :width="Math.abs(selection.to - selection.from) * VB_W"
            y="0"
            :height="VB_H"
          />
        </svg>

        <!-- Les libellés restent en HTML : dans un `viewBox` étiré, un `<text>` serait
             déformé horizontalement. -->
        <div v-if="hovered" class="line-chart__cursor" :style="{ left: `${hovered.left}%` }"></div>
        <div v-if="hovered" class="line-chart__tooltip" :style="{ left: `${hovered.left}%` }" role="tooltip">
          <span class="t-label">{{ hovered.point.fullLabel || hovered.point.label }}</span>
          <strong>{{ formatNumber(hovered.point.value) }}<em v-if="unit"> {{ unit }}</em></strong>
          <span v-if="hovered.point.detail" class="t-detail">{{ hovered.point.detail }}</span>
        </div>
      </div>
    </div>

    <div class="line-chart__x" aria-hidden="true">
      <span v-for="tick in xTicks" :key="tick.key" :style="{ left: `${tick.left}%` }">{{ tick.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/* Courbe avec zoom par sélection.
 *
 * Les périodes de l'activité vont désormais jusqu'à « tout l'historique » : une barre
 * par jour devient illisible bien avant, et surtout inexploitable — on ne peut plus
 * revenir sur un mois précis. Une courbe supporte la densité, et le glisser-déposer
 * horizontal restreint la fenêtre affichée sans recharger quoi que ce soit. */
import { computed, ref, watch } from 'vue';
import { formatInteger as formatNumber } from '@/utils/format';

export interface LinePoint {
  key?: string | number;
  label?: string;
  fullLabel?: string;
  value?: number;
  detail?: string;
}

const props = withDefaults(
  defineProps<{
    points?: LinePoint[];
    height?: number;
    unit?: string;
    ariaLabel?: string;
    /** Couleur du trait ; l'aplat en reprend une teinte diluée. */
    color?: string;
  }>(),
  { points: () => [], height: 200, unit: '', ariaLabel: 'Graphique', color: 'var(--accent)' }
);

const VB_W = 1000;
const VB_H = 100;

const plot = ref<HTMLElement | null>(null);
const range = ref<{ from: number; to: number } | null>(null);
const selection = ref<{ from: number; to: number } | null>(null);
const hoverIndex = ref<number | null>(null);

/* Un changement de jeu de points (autre période, autre granularité) invalide la fenêtre :
   la garder pointerait sur des index qui ne désignent plus les mêmes dates. */
watch(() => props.points, () => { range.value = null; hoverIndex.value = null; });

const visiblePoints = computed(() => {
  const all = props.points.map((p) => ({ ...p, value: Number(p.value || 0) }));
  if (!range.value) return all;
  return all.slice(range.value.from, range.value.to + 1);
});
const zoomed = computed(() => range.value != null);
const maxVal = computed(() => Math.max(1, ...visiblePoints.value.map((p) => p.value)));

const coords = computed(() => {
  const rows = visiblePoints.value;
  const step = rows.length > 1 ? VB_W / (rows.length - 1) : 0;
  return rows.map((point, index) => ({
    point,
    x: rows.length > 1 ? index * step : VB_W / 2,
    y: VB_H - (point.value / maxVal.value) * (VB_H - 6) - 3,
  }));
});

const linePath = computed(() => {
  const pts = coords.value;
  if (!pts.length) return '';
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
});
const areaPath = computed(() => {
  const pts = coords.value;
  if (pts.length < 2) return '';
  return `${linePath.value} L${pts[pts.length - 1].x.toFixed(2)} ${VB_H} L${pts[0].x.toFixed(2)} ${VB_H} Z`;
});

const hovered = computed(() => {
  const index = hoverIndex.value;
  if (index == null || !coords.value[index]) return null;
  const entry = coords.value[index];
  return { ...entry, left: (entry.x / VB_W) * 100 };
});

const xTicks = computed(() => {
  const rows = visiblePoints.value;
  if (!rows.length) return [];
  const wanted = Math.min(6, rows.length);
  const step = wanted > 1 ? (rows.length - 1) / (wanted - 1) : 0;
  return Array.from({ length: wanted }, (_, i) => {
    const index = Math.round(i * step);
    return {
      key: rows[index].key ?? index,
      label: rows[index].label ?? '',
      left: rows.length > 1 ? (index / (rows.length - 1)) * 100 : 50,
    };
  });
});

function fractionAt(event: PointerEvent | MouseEvent): number {
  const box = plot.value?.getBoundingClientRect();
  if (!box || !box.width) return 0;
  return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
}
function indexAt(fraction: number): number {
  const count = visiblePoints.value.length;
  if (count <= 1) return 0;
  return Math.round(fraction * (count - 1));
}

function startSelection(event: PointerEvent): void {
  if (event.button !== 0 || visiblePoints.value.length < 3) return;
  const fraction = fractionAt(event);
  selection.value = { from: fraction, to: fraction };
  // Le suivi du pointeur hors du tracé n'est possible qu'avec un vrai `pointerId` :
  // certains environnements (et les tests) émettent des événements souris simples.
  if (typeof event.pointerId === 'number') {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }
}
function onMove(event: PointerEvent): void {
  const fraction = fractionAt(event);
  hoverIndex.value = indexAt(fraction);
  if (selection.value) selection.value = { ...selection.value, to: fraction };
}
function endSelection(event: PointerEvent): void {
  const current = selection.value;
  selection.value = null;
  if (!current) return;
  const from = Math.min(current.from, current.to);
  const to = Math.max(current.from, current.to);
  // Un simple clic ne doit pas zoomer : sous 2 % de largeur, c'est un clic.
  if (to - from < 0.02) return;
  const offset = range.value?.from ?? 0;
  const first = offset + indexAt(from);
  const last = offset + indexAt(to);
  if (last - first < 1) return;
  range.value = { from: first, to: last };
  hoverIndex.value = null;
  if (typeof event.pointerId === 'number') {
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }
}
function onLeave(): void {
  hoverIndex.value = null;
  selection.value = null;
}
function resetZoom(): void {
  range.value = null;
  hoverIndex.value = null;
}
</script>

<style scoped lang="scss">
.line-chart { display: grid; gap: 4px; min-width: 0; }
.line-chart__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.line-chart__head small { color: var(--muted); font-size: var(--fs-xs); }
.line-chart__reset {
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text);
  padding: 3px 10px;
  font: inherit;
  font-size: var(--fs-xs);
  cursor: pointer;
}
.line-chart__body { display: flex; align-items: stretch; gap: var(--space-2); min-width: 0; }
.line-chart__y {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  min-width: 32px;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  user-select: none;
}
.line-chart__plot { position: relative; flex: 1; min-width: 0; cursor: crosshair; touch-action: pan-y; }
/* Le SVG est sorti du flux : avec un `viewBox` de 1000 unites de large, sa taille
   intrinseque imposait une largeur minimale de plusieurs milliers de pixels a la grille
   qui l'accueille, et le panneau debordait de l'ecran. */
.line-chart__plot svg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; overflow: visible; }
.grid { stroke: var(--border); stroke-width: 1; opacity: .6; }
.line { fill: none; stroke: var(--line-color, var(--accent)); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.area { fill: color-mix(in srgb, var(--line-color, var(--accent)) 18%, transparent); stroke: none; }
.dot { fill: var(--line-color, var(--accent)); stroke: var(--surface); stroke-width: 2; }
.selection { fill: color-mix(in srgb, var(--accent) 16%, transparent); }
.line-chart__cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: color-mix(in srgb, var(--accent) 55%, transparent);
  pointer-events: none;
}
.line-chart__tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  display: grid;
  gap: 2px;
  justify-items: center;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: 0 4px 16px rgba(0, 0, 0, .4);
  white-space: nowrap;
  pointer-events: none;
  z-index: 20;
}
.line-chart__tooltip .t-label, .line-chart__tooltip .t-detail { color: var(--muted); font-size: var(--fs-xs); }
.line-chart__tooltip strong { color: var(--accent); font-size: var(--fs-sm); }
.line-chart__tooltip em { font-style: normal; color: var(--muted); font-size: var(--fs-xs); }
.line-chart__x { position: relative; height: 16px; margin-left: 40px; }
.line-chart__x span {
  position: absolute;
  transform: translateX(-50%);
  color: var(--muted);
  font-size: var(--fs-xs);
  white-space: nowrap;
  user-select: none;
}
</style>
