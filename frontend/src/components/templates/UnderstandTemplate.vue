<template>
  <!-- Gabarit « Comprendre » : repond a « que s'est-il passe ? ». Une page de lecture, ou
       le temps structure tout :
         1. la periode et l'etat (selecteurs), le bilan de la periode (facultatif) et
            l'export de ce qui est affiche ;
         2. la chronologie groupee par jour : heure, resultat, ce qui s'est passe, contexte ;
         3. le detail d'un evenement dans une feuille, a cote de la liste (par-dessus sur
            telephone), sans perdre sa place.
       Pas d'action dans la liste : au plus une, dans le detail, qui renvoie vers Traiter
       ou Suivre. -->
  <div class="understand" :class="{ 'has-detail': detail }">
    <div class="understand__main">
      <div class="understand__bar">
        <!-- La periode cadre toute la page (capsule de recherche) ; l'etat filtre la liste. -->
        <PageTools v-if="periods.length"><UiSegmentedControl :model-value="period" :options="periods" ariaLabel="Période" @update:model-value="emit('update:period', String($event))" /></PageTools>
        <UiSegmentedControl v-if="outcomes.length" :model-value="outcome" :options="outcomes" ariaLabel="Résultat" @update:model-value="emit('update:outcome', String($event))" />
        <UiButton v-if="exportable" size="sm" class="understand__export" @click="emit('export')"><template #icon><Download /></template>Exporter</UiButton>
      </div>
      <ul v-if="summary.length" class="understand__summary" aria-label="Bilan de la période">
        <li v-for="entry in summary" :key="entry.key" :class="`is-${entry.tone || 'neutral'}`"><strong>{{ entry.value }}</strong> {{ entry.label }}</li>
      </ul>

      <p v-if="loading && !events.length" class="understand__loading">Chargement…</p>
      <template v-else-if="days.length">
        <section v-for="day in days" :key="day.key" class="understand__day" :aria-label="day.label">
          <h2>{{ day.label }}</h2>
          <ol class="understand__list">
            <li v-for="event in day.events" :key="event.key">
              <button type="button" class="understand-row" :class="[`is-${event.outcome}`, { 'is-open': event.key === openKey }]" :aria-pressed="event.key === openKey" @click="emit('open', event)">
                <time :datetime="event.at">{{ timeOf(event.at) }}</time>
                <component :is="ICONS[event.outcome]" class="understand-row__icon" aria-hidden="true" />
                <span class="sr-only">{{ OUTCOME_LABELS[event.outcome] }} :</span>
                <span class="understand-row__text">
                  <strong>{{ event.title }}</strong>
                  <small v-if="event.detail">{{ event.detail }}</small>
                  <span v-if="event.tags?.length" class="understand-tags"><UiBadge v-for="tag in event.tags" :key="tag">{{ tag }}</UiBadge></span>
                </span>
                <small v-if="event.context" class="understand-row__context">{{ event.context }}</small>
              </button>
            </li>
          </ol>
        </section>
      </template>
      <UiEmptyState v-else :icon="History" :title="emptyTitle" :message="emptyMessage" />

      <InfiniteScrollTrigger :has-more="hasMore" :loading="loadingMore" @load="emit('load-more')" />
    </div>

    <div v-if="detail" class="understand__sheet">
      <UnderstandDetailPanel :detail="detail" @close="emit('close')" @action="emit('action', $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatLongDay, formatTime } from '@/utils/format';
import { computed } from 'vue';
import { AlertTriangle, CheckCircle2, Download, History, Info, XCircle } from '@lucide/vue';
import InfiniteScrollTrigger from '@/components/ui/InfiniteScrollTrigger.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import PageTools from '@/components/ui/PageTools.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import { parseApiDate } from '@/utils/format';
import UnderstandDetailPanel from './understand/UnderstandDetail.vue';
import type { UnderstandDetail, UnderstandEvent, UnderstandOption, UnderstandOutcome, UnderstandSummary } from './understand/types';

export type { UnderstandDetail, UnderstandEvent, UnderstandOption, UnderstandOutcome, UnderstandSummary } from './understand/types';

const props = withDefaults(
  defineProps<{
    events: UnderstandEvent[];
    /** Detail de l'evenement ouvert (`open`), charge par la page. */
    detail?: UnderstandDetail | null;
    openKey?: string;
    periods?: UnderstandOption[];
    period?: string;
    outcomes?: UnderstandOption[];
    outcome?: string;
    summary?: UnderstandSummary[];
    exportable?: boolean;
    hasMore?: boolean;
    loading?: boolean;
    loadingMore?: boolean;
    emptyTitle?: string;
    emptyMessage?: string;
  }>(),
  {
    detail: null,
    openKey: '',
    periods: () => [],
    period: '',
    outcomes: () => [],
    outcome: '',
    summary: () => [],
    exportable: true,
    hasMore: false,
    loading: false,
    loadingMore: false,
    emptyTitle: 'Rien sur cette période',
    emptyMessage: 'Aucun événement ne correspond à la période et au résultat choisis.',
  },
);
const emit = defineEmits<{
  'update:period': [value: string];
  'update:outcome': [value: string];
  open: [event: UnderstandEvent];
  close: [];
  action: [key: string];
  export: [];
  'load-more': [];
}>();

const ICONS: Record<UnderstandOutcome, any> = { success: CheckCircle2, failed: XCircle, warning: AlertTriangle, info: Info };
const OUTCOME_LABELS: Record<UnderstandOutcome, string> = { success: 'Réussi', failed: 'Échec', warning: 'Avertissement', info: 'Information' };

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return 'Aujourd’hui';
  if (dayKey(date) === dayKey(yesterday)) return 'Hier';
  return formatLongDay(date);
}
const timeOf = (at: string) => formatTime(at);

/* Du plus recent au plus ancien, un groupe par jour. */
const days = computed(() => {
  const groups = new Map<string, { key: string; label: string; events: UnderstandEvent[] }>();
  const sorted = props.events.slice().sort((a, b) => parseApiDate(b.at).getTime() - parseApiDate(a.at).getTime());
  for (const event of sorted) {
    const date = parseApiDate(event.at);
    const key = dayKey(date);
    if (!groups.has(key)) groups.set(key, { key, label: dayLabel(date), events: [] });
    groups.get(key)!.events.push(event);
  }
  return [...groups.values()];
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.understand { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); min-width: 0; }
.understand.has-detail { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); align-items: start; }
.understand__main { display: grid; align-content: start; gap: var(--space-3); min-width: 0; }
.understand__bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.understand__export { margin-left: auto; }
.understand__summary { display: flex; flex-wrap: wrap; gap: var(--space-4); margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: var(--fs-sm); }
.understand__summary strong { color: var(--text); }
.understand__summary .is-success strong { color: var(--green-text, var(--green)); }
.understand__summary .is-danger strong { color: var(--red-text); }
.understand__loading { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.understand__day { display: grid; gap: var(--space-2); }
.understand__day h2 { margin: 0; color: var(--muted); font-size: var(--fs-sm); font-weight: 700; }
.understand__list { margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); list-style: none; overflow: hidden; }
.understand__list > li + li { border-top: 1px solid var(--border); }
.understand-row { display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-2) var(--space-3); border: 0; background: transparent; color: var(--text); font: inherit; font-size: var(--fs-sm); text-align: left; cursor: pointer; }
.understand-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.understand-tags :deep(.ui-badge) { min-height: 20px; padding: 0 6px; }
.understand-row:hover { background: var(--surface-2); }
.understand-row.is-open { background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
.understand-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.understand-row time { flex: none; min-width: 3.2em; color: var(--muted); font-variant-numeric: tabular-nums; }
.understand-row__icon { flex: none; width: 16px; height: 16px; color: var(--green); }
.understand-row.is-failed .understand-row__icon { color: var(--red-text); }
.understand-row.is-warning .understand-row__icon { color: var(--amber-text); }
.understand-row.is-info .understand-row__icon { color: var(--muted); }
.understand-row__text { display: grid; flex: 1 1 auto; gap: 1px; min-width: 0; }
.understand-row__text strong { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.understand-row__text small { color: var(--muted); }
.understand-row.is-failed .understand-row__text small { color: var(--red-text); }
.understand-row__context { flex: none; color: var(--muted); }
.understand__sheet { position: sticky; top: var(--space-4); min-width: 0; }

/* Telephone : le detail passe par-dessus la liste, en feuille, et la place est gardee. */
@include bp.until(desktop) {
  .understand.has-detail { grid-template-columns: minmax(0, 1fr); }
  .understand__sheet { position: fixed; inset: auto 0 0; z-index: 40; max-height: 80vh; overflow-y: auto; padding: var(--space-2); }
}
</style>
