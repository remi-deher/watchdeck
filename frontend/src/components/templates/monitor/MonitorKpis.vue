<template>
  <section class="overview-kpis" :aria-label="label">
    <RouterLink v-for="kpi in kpis" :key="kpi.key" class="overview-kpi" :to="kpi.to">
      <span class="overview-kpi__label">{{ kpi.label }}</span>
      <strong class="overview-kpi__value">{{ kpi.value }}<small v-if="kpi.unit">{{ kpi.unit }}</small></strong>
      <svg v-if="kpi.spark" class="overview-kpi__spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
        <polyline :points="sparkPoints(kpi.spark)" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      </svg>
      <span class="overview-pill" :class="`is-${kpi.tone}`">{{ kpi.status }}</span>
    </RouterLink>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import type { MonitorKpi } from './types';

withDefaults(defineProps<{ kpis: MonitorKpi[]; label?: string }>(), { label: 'Activité de l’instance' });

/** Courbe sur 100×24 : l'échelle suit le jour le plus chargé, une série vide reste à plat. */
function sparkPoints(values: number[]): string {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? 100 / (values.length - 1) : 100;
  return values.map((value, index) => `${(index * step).toFixed(1)},${(22 - (value / max) * 20).toFixed(1)}`).join(' ');
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.overview-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
.overview-kpi {
  display: grid;
  gap: var(--space-1);
  align-content: start;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  min-width: 0;
}
.overview-kpi:hover { border-color: var(--border-hover); }
.overview-kpi:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.overview-kpi__label { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.overview-kpi__value {
  overflow: hidden;
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.overview-kpi__value small { margin-left: .35em; color: var(--muted); font-family: var(--font-sans); font-size: var(--fs-sm); font-weight: 500; }
.overview-kpi__spark { width: 100%; height: 24px; color: var(--accent); }

.overview-pill {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 6px;
  max-width: 100%;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.overview-pill::before { content: ''; flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.overview-pill.is-ok { color: var(--green-text); background: color-mix(in srgb, var(--green) 12%, transparent); }
.overview-pill.is-warn { color: var(--amber-text); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.overview-pill.is-error { color: var(--red-text); background: color-mix(in srgb, var(--red) 14%, transparent); }
.overview-pill.is-info { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }

@include bp.until(desktop) {
  .overview-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
/* Deux tuiles de 140 px : l'état passe à la ligne plutôt que d'être coupé. */
@include bp.until(shell-medium) {
  .overview-pill { white-space: normal; line-height: 1.3; }
}
</style>
