<template>
  <PanelCard :title="`Activité sur ${period} jours`" eyebrow="Tendance" panel-class="span-two activity-panel-container">
    <template #action>
        <div class="activity-head-actions">
          <div class="activity-period">
            <button
              v-for="days in [7, 30]"
              :key="days"
              type="button"
              :class="{ active: period === days }"
              :aria-pressed="period === days"
              @click="period = days"
            >
              {{ days }} j
            </button>
          </div>
          <span class="activity-trend" :class="trend.direction">{{ trend.label }}</span>
        </div>
    </template>

      <div class="activity-series" aria-label="Type d'activité">
        <button
          v-for="option in seriesOptions"
          :key="option.key"
          type="button"
          :class="[option.key, { active: activeSeries === option.key }]"
          :aria-pressed="activeSeries === option.key"
          @click="activeSeries = option.key"
        >
          <i :style="{ background: option.indicatorColor }"></i>{{ option.label }}
          <span class="series-badge">{{ seriesTotals[option.key] || 0 }}</span>
        </button>
      </div>

      <div class="activity-chart-wrapper">
        <BarChart
          :points="chartPoints"
          :unit="activeOption.unit"
          :height="170"
          :bar-color="activeColor"
          show-peak
        />
      </div>
    <!-- Panneau latéral d'insights -->
    <aside class="activity-insights-col">
      <div class="insights-head">
        <span class="eyebrow">Dynamique</span>
        <h3>Synthèse de période</h3>
      </div>

      <div class="insights-grid">
        <div class="insight-card">
          <span class="insight-label">Demandes reçues</span>
          <strong class="insight-value text-accent">{{ requestsTotal }}</strong>
          <small class="insight-sub">{{ period }} derniers jours</small>
        </div>

        <div class="insight-card">
          <span class="insight-label">Médias disponibles</span>
          <strong class="insight-value text-success">{{ availabilityTotal }}</strong>
          <small class="insight-sub">{{ deliveryRate }} de complétion</small>
        </div>

        <div class="insight-card">
          <span class="insight-label">Moyenne active</span>
          <strong class="insight-value">{{ average }}</strong>
          <small class="insight-sub">{{ activeOption.unit }}/jour</small>
        </div>

        <div class="insight-card">
          <span class="insight-label">Pic d'activité</span>
          <strong class="insight-value">{{ peak.value }}</strong>
          <small class="insight-sub">{{ peak.label }}</small>
        </div>
      </div>
    </aside>
  </PanelCard>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatLongDay as formatLongDate, formatNumber } from '@/utils/format';
import BarChart from '@/components/ui/charts/BarChart.vue';
import PanelCard from '@/components/ui/PanelCard.vue';

export interface TimelineData {
  labels?: string[];
  values?: number[];
  series?: Record<string, number[]>;
}

const props = withDefaults(
  defineProps<{
    timeline?: TimelineData;
  }>(),
  {
    timeline: () => ({ labels: [], values: [] }),
  }
);

const activeSeries = ref('requests');
const period = ref(30);

const seriesOptions = [
  { key: 'requests', label: 'Demandes', unit: 'demandes', indicatorColor: '#fbbf24', color: 'linear-gradient(180deg, #fbbf24, #f59e0b)' },
  { key: 'availability', label: 'Disponibilités', unit: 'médias', indicatorColor: '#4ade80', color: 'linear-gradient(180deg, #4ade80, #22c55e)' },
  { key: 'notifications', label: 'Notifications', unit: 'envois', indicatorColor: '#a78bfa', color: 'linear-gradient(180deg, #a78bfa, #8b5cf6)' },
];

const activeOption = computed(() => seriesOptions.find((item) => item.key === activeSeries.value) || seriesOptions[0]);
const activeColor = computed(() => activeOption.value.color);

function getSeriesValues(key: string): number[] {
  return props.timeline.series?.[key] || (key === 'requests' ? props.timeline.values : []) || [];
}

const seriesTotals = computed(() => {
  const res: Record<string, number> = {};
  for (const opt of seriesOptions) {
    const raw = getSeriesValues(opt.key).slice(-period.value);
    res[opt.key] = raw.reduce((a, b) => a + b, 0);
  }
  return res;
});

const requestsTotal = computed(() => seriesTotals.value.requests || 0);
const availabilityTotal = computed(() => seriesTotals.value.availability || 0);

const deliveryRate = computed(() => {
  const req = requestsTotal.value;
  const avail = availabilityTotal.value;
  if (!req && !avail) return 'Flux calme';
  if (!req) return `${avail} livrés`;
  const pct = Math.min(100, Math.round((avail / req) * 100));
  return `${pct}% livrés`;
});

const allValues = computed(() => getSeriesValues(activeSeries.value));
const values = computed(() => allValues.value.slice(-period.value));
const labels = computed(() => (props.timeline.labels || []).slice(-period.value));

const total = computed(() => values.value.reduce((a, b) => a + b, 0));
const average = computed(() => formatNumber((total.value || 0) / Math.max(1, values.value.length)));

const peak = computed(() => {
  const points = values.value;
  const periodLabels = labels.value;
  const value = Math.max(0, ...points);
  const index = points.indexOf(value);
  return {
    value,
    label: index < 0 ? 'Aucune activité' : formatLongDate(periodLabels[index], { day: 'numeric', month: 'short' }),
  };
});

const trend = computed(() => {
  const points = values.value;
  const recent = points.slice(-7).reduce((a, b) => a + b, 0);
  const previous = points.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (!recent && !previous) return { direction: 'stable', label: 'Aucune activité récente' };
  if (!previous) return { direction: 'up', label: `+${recent} sur 7 jours` };
  const change = Math.round(((recent - previous) / previous) * 100);
  if (Math.abs(change) < 5) return { direction: 'stable', label: 'Stable sur 7 jours' };
  return { direction: change > 0 ? 'up' : 'down', label: `${change > 0 ? '+' : ''}${change}% sur 7 jours` };
});

function formatChartDate(v?: string): string {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

const chartPoints = computed(() => {
  const vals = values.value;
  const labs = labels.value;
  return vals.map((val, idx) => ({
    key: labs[idx] || idx,
    label: formatChartDate(labs[idx]),
    fullLabel: formatLongDate(labs[idx]),
    value: val,
    detail: `${val} ${activeOption.value.unit}`,
  }));
});
</script>

<style scoped lang="scss">
.activity-panel-container {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: var(--space-4);
  padding: var(--space-4);
}

:deep(.ui-section-header) {
  grid-column: 1;
}

.activity-head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.activity-period {
  display: inline-flex;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.activity-period button {
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--radius-xs);
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.activity-period button.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.activity-trend {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
}

.activity-trend.up {
  color: var(--success);
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.08);
}

.activity-trend.down {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
}

.activity-series {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  grid-column: 1;
}

.activity-series button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.activity-series button:hover {
  color: var(--text);
  border-color: var(--border-hover, var(--border));
}

.activity-series button.active {
  background: var(--surface);
  color: var(--text);
  border-color: var(--accent);
}

.activity-series button i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.series-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  background: var(--surface);
  color: var(--muted);
}

.activity-chart-wrapper {
  min-height: 170px;
  grid-column: 1;
}

/* Colonne insights */
.activity-insights-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-left: var(--space-4);
  border-left: 1px solid var(--border);
  grid-column: 2;
  grid-row: 1 / span 3;
}

.insights-head h3 {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

.insights-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  height: 100%;
}

.insight-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  gap: 2px;
}

.insight-label {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
}

.insight-value {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}

.insight-sub {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-accent {
  color: #fbbf24;
}

.text-success {
  color: var(--success);
}

@media (max-width: 900px) {
  .activity-panel-container {
    grid-template-columns: 1fr;
  }
  .activity-insights-col {
    grid-column: 1;
    grid-row: auto;
    padding-left: 0;
    padding-top: var(--space-3);
    border-left: none;
    border-top: 1px solid var(--border);
  }
}
</style>
