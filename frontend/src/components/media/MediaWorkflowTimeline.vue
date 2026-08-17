<template>
  <section v-if="steps?.length" class="workflow-card">
    <div class="workflow-heading">
      <h2>Parcours du media</h2>
      <span>{{ progressLabel }}</span>
    </div>
    <ol class="workflow-timeline">
      <li v-for="step in steps" :key="step.key" :class="`is-${step.state}`">
        <span class="workflow-marker">
          <Check v-if="step.state === 'completed'" />
          <TriangleAlert v-else-if="step.state === 'error'" />
          <Circle v-else />
        </span>
        <div>
          <strong>{{ step.label }}</strong>
          <small v-if="step.occurred_at" :title="formatDate(step.occurred_at)">{{ formatRelativeDate(step.occurred_at) }}</small>
          <small v-else-if="step.state === 'current'">Etape actuelle</small>
          <small v-else-if="step.state === 'upcoming'">A venir</small>
        </div>
      </li>
    </ol>

    <div v-if="history?.length" class="workflow-history">
      <div class="workflow-history-heading">
        <h3>Historique</h3>
        <div v-if="historyKinds.length > 1" class="workflow-history-filters">
          <button type="button" :class="{ active: historyFilter === 'all' }" @click="historyFilter = 'all'">Tout</button>
          <button v-for="kind in historyKinds" :key="kind" type="button" :class="{ active: historyFilter === kind }" @click="historyFilter = kind">
            {{ HISTORY_KIND_LABELS[kind] || kind }}
          </button>
        </div>
      </div>
      <ul>
        <li v-for="(event, index) in visibleHistory" :key="`${event.kind}-${event.occurred_at}-${index}`" :class="`is-${event.state}`">
          <span class="workflow-marker">
            <component :is="historyIcon(event)" />
          </span>
          <div>
            <strong>{{ event.label }}<span v-if="(event.count ?? 1) > 1" class="workflow-history-count"> x{{ event.count }}</span></strong>
            <small v-if="event.occurred_at" :title="formatDate(event.occurred_at)">{{ formatRelativeDate(event.occurred_at) }}</small>
          </div>
        </li>
      </ul>
      <p v-if="!mergedHistory.length" class="workflow-history-empty">Aucun evenement pour ce filtre.</p>
      <button v-if="hiddenCount > 0" type="button" class="workflow-history-toggle" @click="historyExpanded = true">
        Voir {{ hiddenCount }} evenement{{ hiddenCount > 1 ? 's' : '' }} de plus
        <ChevronDown />
      </button>
      <button v-else-if="historyExpanded && mergedHistory.length > HISTORY_VISIBLE_LIMIT" type="button" class="workflow-history-toggle" @click="historyExpanded = false">
        Reduire
        <ChevronUp />
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { formatDateTime as formatDate, formatRelativeDate } from '@/utils/format';
import { computed, ref, watch } from 'vue';
import { Check, ChevronDown, ChevronUp, Circle, RefreshCw, Sparkles, TriangleAlert } from '@lucide/vue';

const HISTORY_VISIBLE_LIMIT = 5;

export interface WorkflowStep {
  key: string;
  label: string;
  state: 'completed' | 'current' | 'upcoming' | 'error' | string;
  occurred_at?: string | null;
}

export interface WorkflowHistoryEvent {
  kind: string;
  label: string;
  state: string;
  occurred_at?: string | null;
  count?: number;
}

const props = withDefaults(
  defineProps<{
    steps?: WorkflowStep[];
    history?: WorkflowHistoryEvent[];
  }>(),
  {
    steps: () => [],
    history: () => [],
  }
);
const progressLabel = computed(() => {
  const current = props.steps.find((step) => step.state === 'current' || step.state === 'error');
  return current?.label || props.steps.at(-1)?.label || '';
});

const HISTORY_ICONS: Record<string, any> = { vf_upgrade: Sparkles, file_replaced: RefreshCw, issue: TriangleAlert };
const HISTORY_KIND_LABELS: Record<string, string> = { vf_upgrade: 'Upgrades VF', file_replaced: 'Fichiers *ARR', issue: 'Signalements' };
function historyIcon(event: WorkflowHistoryEvent): any {
  if (event.state === 'error') return TriangleAlert;
  if (event.kind === 'issue') return Check;
  return HISTORY_ICONS[event.kind] || Check;
}

const historyFilter = ref('all');
const historyKinds = computed(() =>
  Object.keys(HISTORY_KIND_LABELS).filter((kind) => props.history.some((event) => event.kind === kind))
);
const filteredHistory = computed(() =>
  historyFilter.value === 'all'
    ? props.history
    : props.history.filter((event) => event.kind === historyFilter.value)
);

const mergedHistory = computed(() => {
  const merged: WorkflowHistoryEvent[] = [];
  for (const event of filteredHistory.value) {
    const last = merged.at(-1);
    if (last && last.kind === event.kind && last.label === event.label && last.state === event.state) {
      last.count = (last.count ?? 1) + 1;
    } else {
      merged.push({ ...event, count: 1 });
    }
  }
  return merged;
});

const historyExpanded = ref(false);
watch(historyFilter, () => {
  historyExpanded.value = false;
});

const visibleHistory = computed(() =>
  historyExpanded.value ? mergedHistory.value : mergedHistory.value.slice(0, HISTORY_VISIBLE_LIMIT)
);
const hiddenCount = computed(() =>
  historyExpanded.value ? 0 : Math.max(0, mergedHistory.value.length - HISTORY_VISIBLE_LIMIT)
);
</script>

<style scoped lang="scss">
.workflow-card { margin-bottom: 18px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-2); overflow: hidden; }
.workflow-heading { display: flex; justify-content: space-between; gap: var(--space-3); align-items: baseline; margin-bottom: 16px; }
.workflow-heading h2 { margin: 0; font-size: var(--fs-base); }
.workflow-heading span { color: var(--muted); font-size: var(--fs-sm); text-align: right; }
.workflow-timeline { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.workflow-timeline li { position: relative; display: flex; align-items: flex-start; gap: var(--space-2); padding: 0 0 18px; color: var(--muted); text-align: left; }
.workflow-timeline li::after { content: ''; position: absolute; z-index: 0; top: 24px; bottom: 0; left: 11px; width: 2px; background: var(--border); }
.workflow-timeline li:last-child::after { display: none; content: none; }
.workflow-marker { position: relative; z-index: 1; flex: 0 0 24px; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: var(--surface-2); border: 2px solid var(--border); }
.workflow-timeline li > div { min-width: 0; padding-top: 3px; }
.workflow-marker :deep(svg) { width: 13px; height: 13px; }
.workflow-timeline strong, .workflow-timeline small { display: block; }
.workflow-timeline strong { color: inherit; font-size: var(--fs-sm); line-height: 1.25; }
.workflow-timeline small { margin-top: 4px; font-size: var(--fs-xs); cursor: default; }
.workflow-timeline .is-completed { color: var(--success, #42b883); }
.workflow-timeline .is-completed::after { background: var(--success, #42b883); }
.workflow-timeline .is-current { color: var(--text); }
.workflow-timeline .is-current .workflow-marker { border-color: var(--accent); color: var(--accent); }
.workflow-timeline .is-error { color: var(--danger, #ef5350); }
.workflow-timeline .is-error .workflow-marker { border-color: currentColor; }
.workflow-history { margin-top: 4px; padding-top: 16px; border-top: 1px solid var(--border); }
.workflow-history-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-bottom: 10px; }
.workflow-history h3 { margin: 0; font-size: var(--fs-sm); color: var(--muted); font-weight: 650; }
.workflow-history-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.workflow-history-filters button { padding: 3px 10px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: transparent; color: var(--muted); font-size: var(--fs-xs); cursor: pointer; }
.workflow-history-filters button.active { border-color: var(--accent); color: var(--accent); }
.workflow-history ul { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.workflow-history li { display: flex; align-items: flex-start; gap: var(--space-2); color: var(--muted); }
.workflow-history li > div { min-width: 0; }
.workflow-history strong, .workflow-history small { display: block; }
.workflow-history strong { color: inherit; font-size: var(--fs-sm); line-height: 1.25; }
.workflow-history small { margin-top: 2px; font-size: var(--fs-xs); cursor: default; }
.workflow-history .is-completed { color: var(--success, #42b883); }
.workflow-history .is-error { color: var(--danger, #ef5350); }
.workflow-history .is-error .workflow-marker { border-color: currentColor; }
.workflow-history-empty { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.workflow-history-count { color: var(--muted); font-weight: 500; }
.workflow-history-toggle {
  display: flex; align-items: center; gap: 6px;
  margin-top: 10px; padding: 6px 4px; border: 0; background: transparent;
  color: var(--accent); font-size: var(--fs-xs); font-weight: 600; cursor: pointer;
}
.workflow-history-toggle:hover { text-decoration: underline; }
.workflow-history-toggle svg { width: 14px; height: 14px; }
@media (min-width: 1025px) {
  .workflow-card { padding: 19px 20px; }
  .workflow-heading h2 { font-size: var(--fs-lg); }
  .workflow-heading span { font-size: var(--fs-sm); }
  .workflow-timeline strong { font-size: var(--fs-md); line-height: 1.35; }
  .workflow-timeline small { font-size: var(--fs-sm); }
}
</style>
