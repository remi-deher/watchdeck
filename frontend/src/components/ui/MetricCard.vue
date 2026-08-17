<template>
  <component
    :is="to ? 'RouterLink' : 'article'"
    :to="to || undefined"
    class="metric-card"
    :class="[cardClass, { 'metric-card-link': to, 'is-loading': loading }]"
  >
    <template v-if="icon">
      <component :is="icon" class="metric-icon" />
      <div>
        <span>{{ label }}</span>
        <strong v-if="!loading">{{ value }}</strong>
        <div v-else class="metric-skeleton-value"></div>
        <small v-if="detail">{{ detail }}</small>
        <span v-if="trendObj" class="metric-trend" :class="trendObj.direction">
          {{ trendObj.label }}
        </span>
        <div v-if="progressObj" class="metric-progress-wrap">
          <div class="metric-progress-bar" :style="{ width: `${progressObj.percent}%` }"></div>
        </div>
      </div>
      <SparklineChart
        v-if="sparkline && sparkline.length > 1"
        :points="sparkline"
        :height="28"
        class="metric-card-sparkline"
      />
    </template>
    <template v-else>
      <span>{{ label }}</span>
      <strong v-if="!loading">{{ value }}</strong>
      <div v-else class="metric-skeleton-value"></div>
      <small v-if="detail">{{ detail }}</small>
      <span v-if="trendObj" class="metric-trend" :class="trendObj.direction">
        {{ trendObj.label }}
      </span>
      <div v-if="progressObj" class="metric-progress-wrap">
        <div class="metric-progress-bar" :style="{ width: `${progressObj.percent}%` }"></div>
      </div>
      <SparklineChart
        v-if="sparkline && sparkline.length > 1"
        :points="sparkline"
        :height="28"
        class="metric-card-sparkline"
      />
    </template>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SparklineChart from './charts/SparklineChart.vue';

interface MetricTrend {
  direction?: 'up' | 'down' | 'stable' | string;
  label?: string;
}

interface MetricProgress {
  value?: number;
  current?: number;
  max?: number;
  total?: number;
}

const props = withDefaults(
  defineProps<{
    label: string;
    value?: string | number;
    detail?: string;
    icon?: any;
    to?: string | Record<string, any> | null;
    cardClass?: string;
    trend?: MetricTrend | string | null;
    trendDirection?: string;
    trendLabel?: string;
    sparkline?: number[] | null;
    progress?: MetricProgress | null;
    loading?: boolean;
  }>(),
  {
    value: '—',
    detail: '',
    icon: null,
    to: null,
    cardClass: '',
    trend: null,
    trendDirection: 'stable',
    trendLabel: '',
    sparkline: null,
    progress: null,
    loading: false,
  }
);

const trendObj = computed<{ direction: string; label: string } | null>(() => {
  if (typeof props.trend === 'object' && props.trend !== null) {
    return {
      direction: props.trend.direction || 'stable',
      label: props.trend.label || '',
    };
  }
  if (typeof props.trend === 'string' && props.trend) {
    return {
      direction: props.trendDirection || 'stable',
      label: props.trend,
    };
  }
  if (props.trendLabel) {
    return {
      direction: props.trendDirection || 'stable',
      label: props.trendLabel,
    };
  }
  return null;
});

const progressObj = computed(() => {
  if (!props.progress) return null;
  const val = Number(props.progress.value ?? props.progress.current ?? 0);
  const max = Number(props.progress.max ?? props.progress.total ?? 100);
  const percent = max > 0 ? Math.min(100, Math.max(0, (val / max) * 100)) : 0;
  return { val, max, percent };
});
</script>

<style scoped lang="scss">
.metric-card {
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  position: relative;
  overflow: hidden;
}
.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  border-color: var(--border-hover, var(--border));
}
.metric-card strong {
  display: block;
  margin-top: 8px;
  color: var(--text);
  font-size: var(--fs-3xl);
  text-shadow: 0 2px 12px rgba(229, 160, 13, 0.3);
  font-variant-numeric: tabular-nums;
}
.metric-card-link {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.metric-trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-xs);
  font-weight: 700;
  margin-top: 6px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
}
.metric-trend.up {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}
.metric-trend.down {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}
.metric-trend.stable {
  color: var(--muted);
  background: var(--surface-2);
}

.metric-progress-wrap {
  width: 100%;
  height: 4px;
  background: var(--surface-2);
  border-radius: var(--radius-pill);
  margin-top: 8px;
  overflow: hidden;
}
.metric-progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
  transition: width 0.3s ease;
}

.metric-card-sparkline {
  margin-top: 8px;
  width: 100%;
}

.metric-skeleton-value {
  width: 64px;
  height: 32px;
  margin-top: 8px;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  animation: pulse-skeleton 1.5s infinite ease-in-out;
}

@keyframes pulse-skeleton {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.25; }
}
</style>
