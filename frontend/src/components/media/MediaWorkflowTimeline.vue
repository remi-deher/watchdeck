<template>
  <section v-if="steps?.length" class="workflow-card">
    <div class="workflow-heading">
      <h2>Parcours du média</h2>
      <span>{{ progressLabel }}</span>
    </div>
    <StepTimeline :steps="timelineSteps">
      <template #meta="{ step }">
        <small v-if="step.at" class="workflow-step-meta" :title="formatDate(step.at)">{{ formatRelativeDate(step.at) }}</small>
        <small v-else-if="step.state === 'current'" class="workflow-step-meta">Étape actuelle</small>
        <small v-else-if="step.state === 'upcoming'" class="workflow-step-meta">À venir</small>
      </template>
    </StepTimeline>

    <div v-if="history?.length" class="workflow-history">
      <div class="workflow-history-heading">
        <h3>Historique</h3>
        <UiChipGroup v-if="historyKinds.length > 1" v-model="historyFilter" :options="historyOptions" label="Filtrer l'historique" default-value="all" />
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
      <p v-if="!mergedHistory.length" class="workflow-history-empty">Aucun événement pour ce filtre.</p>
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
import { Check, ChevronDown, ChevronUp, RefreshCw, Sparkles, TriangleAlert } from '@lucide/vue';
import StepTimeline, { type TimelineStep } from '@/components/ui/StepTimeline.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import type { RequestJourney } from '@/types/generated/mediaAvailability';

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
    journey?: RequestJourney | null;
    history?: WorkflowHistoryEvent[];
  }>(),
  {
    steps: () => [],
    history: () => [],
  }
);
const steps = computed(() => props.journey?.steps ?? props.steps);
/* Le serveur dit « completed » ; la frise commune dit « done ». */
const timelineSteps = computed<TimelineStep[]>(() => steps.value.map((step) => ({
  key: step.key,
  label: step.label,
  at: step.occurred_at,
  state: step.state === 'completed' ? 'done' : (['current', 'upcoming', 'error'].includes(step.state) ? step.state : 'upcoming') as TimelineStep['state'],
})));
const progressLabel = computed(() => {
  const current = steps.value.find((step) => step.state === 'current' || step.state === 'error');
  return current?.label || steps.value.at(-1)?.label || '';
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
const historyOptions = computed(() => [
  { value: 'all', label: 'Tout' },
  ...historyKinds.value.map((kind) => ({ value: kind, label: HISTORY_KIND_LABELS[kind] || kind })),
]);
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
@use '@/styles/foundations/breakpoints' as bp;
.workflow-card { margin-bottom: 18px; padding: 16px; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface-2); overflow: hidden; }
.workflow-heading { display: flex; justify-content: space-between; gap: var(--space-3); align-items: baseline; margin-bottom: 16px; }
.workflow-heading h2 { margin: 0; font-size: var(--fs-base); }
.workflow-heading span { color: var(--muted); font-size: var(--fs-sm); text-align: right; }
.workflow-step-meta { color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; cursor: default; }
.workflow-marker { position: relative; z-index: 1; flex: 0 0 24px; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: var(--surface-2); border: 2px solid var(--border); }
.workflow-marker :deep(svg) { width: 13px; height: 13px; }
.workflow-history { margin-top: 4px; padding-top: 16px; border-top: 1px solid var(--border); }
.workflow-history-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-bottom: 10px; }
.workflow-history h3 { margin: 0; font-size: var(--fs-sm); color: var(--muted); font-weight: 650; }
.workflow-history ul { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.workflow-history li { display: flex; align-items: flex-start; gap: var(--space-2); color: var(--muted); }
.workflow-history li > div { min-width: 0; }
.workflow-history strong, .workflow-history small { display: block; }
.workflow-history strong { color: inherit; font-size: var(--fs-sm); line-height: 1.25; }
.workflow-history small { margin-top: 2px; font-size: var(--fs-xs); cursor: default; }
.workflow-history .is-completed { color: var(--green-text); }
.workflow-history .is-error { color: var(--red-text); }
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
@include bp.from(desktop) {
  .workflow-card { padding: 19px 20px; }
  .workflow-heading h2 { font-size: var(--fs-lg); }
  .workflow-heading span { font-size: var(--fs-sm); }
}
</style>
