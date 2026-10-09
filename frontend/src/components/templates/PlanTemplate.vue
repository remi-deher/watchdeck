<template>
  <!-- Gabarit « Anticiper » : repond a « qu'est-ce qui arrive, et quand ? ». Repris du
       calendrier en production (CalendarView) :
         - trois vues : Mois (grille), Semaine (sept colonnes, sept jours empiles quand la
           place manque), Agenda (jours charges au defilement) ; la vue est memorisee par
           format d'ecran, et le Mois n'est pas propose sur telephone ;
         - la periode : precedente / suivante, choix d'une periode, « Aujourd'hui », balayage
           au doigt, et la nouvelle periode glisse du cote d'ou elle vient ;
         - la recherche (`searching`) bascule en Agenda et dit sur quoi elle porte ;
         - la legende des etats, avec leur nombre ; « + N autres » ouvre le jour.
       La page charge les evenements de la periode (`update:cursor`, `periodBounds`),
       fournit ses etats (libelle, couleur) et, au besoin, une carte riche pour l'Agenda
       (emplacement `agenda-item`). -->
  <div ref="swipeArea" class="plan">
    <div class="calendar-toolbar">
      <!-- La vue cadre toute la page : elle vit dans la capsule de recherche. -->
      <PageTools v-if="!searching"><UiSegmentedControl class="calendar-view-switch" :model-value="view" :options="viewOptions" ariaLabel="Mode d’affichage" @update:model-value="setView(String($event))" /></PageTools>
      <p v-if="searching" class="calendar-search-scope" role="status">{{ shown.length }} résultat{{ shown.length > 1 ? 's' : '' }} {{ searchScope }}</p>

      <div v-if="!searching" class="calendar-navigation">
        <UiButton variant="ghost" icon-only :title="previousLabel" :aria-label="previousLabel" @click="move(-1)"><ChevronLeft /></UiButton>
        <CalendarPeriodPicker :model-value="cursor" :label="periodLabel" @update:model-value="jumpTo" />
        <UiButton variant="ghost" icon-only :title="nextLabel" :aria-label="nextLabel" @click="move(1)"><ChevronRight /></UiButton>
        <UiButton class="calendar-today" title="Aujourd'hui" aria-label="Aujourd'hui" @click="goToday"><CalendarCheck class="calendar-today-icon" aria-hidden="true" /><span class="calendar-today-label">Aujourd'hui</span></UiButton>
      </div>

      <ul v-if="legend.length" class="calendar-legend" aria-label="Légende">
        <li v-for="item in legend" :key="item.key" :style="{ '--state-color': item.color }"><i></i>{{ item.label }} <small>{{ item.count }}</small></li>
      </ul>
    </div>

    <UiFeedback v-if="error" type="error" title="Calendrier indisponible" :message="error" retry @retry="emit('retry')" />

    <div :key="periodKey" class="calendar-period" :class="slideDirection ? `slide-${slideDirection}` : ''">
      <div v-if="displayView === 'month'" class="month-calendar-shell" tabindex="0" aria-label="Calendrier mensuel, défilement horizontal disponible">
        <div class="month-calendar">
          <div v-for="label in WEEK_LABELS" :key="label" class="month-weekday">{{ label }}</div>
          <div v-for="cell in monthCells" :key="cell.key" class="month-cell" :class="{ outside: !cell.current, today: cell.date === todayStr }">
            <header><span>{{ cell.day }}</span><small v-if="cell.date === todayStr">Aujourd'hui</small></header>
            <button v-for="event in cell.events.slice(0, 3)" :key="event.key" class="month-event" :style="stateStyle(event)" :title="describe(event)" @click="emit('open', event)">
              <component :is="event.icon" v-if="event.icon" class="month-event-icon" aria-hidden="true" />
              <span v-if="timeOf(event)">{{ timeOf(event) }}</span><strong>{{ event.title }}</strong>
            </button>
            <button v-if="cell.events.length > 3" class="month-more" @click="showDay(cell.date)">+ {{ cell.events.length - 3 }} autre{{ cell.events.length > 4 ? 's' : '' }}</button>
          </div>
        </div>
      </div>

      <div v-else-if="displayView === 'week'" class="week-calendar">
        <section v-for="day in weekDays" :key="day.date" class="week-day" :class="{ today: day.date === todayStr, 'is-empty': !day.events.length }" :aria-label="formatLongDay(day.date)">
          <header class="week-day-header">
            <span class="week-day-name">{{ day.weekday }}</span>
            <span class="week-day-number">{{ day.day }}</span>
            <small v-if="day.date === todayStr">Aujourd'hui</small>
          </header>
          <div class="week-events">
            <button v-for="event in day.events" :key="event.key" type="button" class="week-event" :style="stateStyle(event)" :title="describe(event)" @click="emit('open', event)">
              <span class="week-event-poster">
                <img v-if="event.poster" :src="event.poster" alt="" loading="lazy" decoding="async">
                <component :is="event.icon" v-else-if="event.icon" aria-hidden="true" />
              </span>
              <span class="week-event-text">
                <strong>{{ event.title }}</strong>
                <small><component :is="event.icon" v-if="event.icon" class="week-event-icon" aria-hidden="true" />{{ timeOf(event) ? `${timeOf(event)} · ` : '' }}{{ event.subtitle }}</small>
                <em v-if="stateOf(event)?.emphasize">{{ stateOf(event)?.label }}</em>
              </span>
            </button>
            <p v-if="!day.events.length" class="week-empty">Rien de prévu</p>
          </div>
        </section>
      </div>

      <div v-else class="calendar-agenda">
        <section v-for="group in shownGroups" :id="`plan-date-${group.date}`" :key="group.date" class="calendar-day" :class="{ today: group.date === todayStr }">
          <div class="calendar-day-header">
            <h2>{{ formatLongDay(group.date) }}</h2>
            <div class="calendar-day-sub">
              <span v-if="group.date === todayStr" class="today-badge">Aujourd'hui</span>
              <span class="day-event-count">{{ group.events.length }} {{ group.events.length > 1 ? unit[1] : unit[0] }}</span>
            </div>
          </div>
          <div class="calendar-events">
            <template v-for="event in group.events" :key="event.key">
              <slot name="agenda-item" :event="event" :time="timeOf(event)">
                <button type="button" class="plan-row" :style="stateStyle(event)" @click="emit('open', event)">
                  <span class="plan-row__poster"><img v-if="event.poster" :src="event.poster" alt="" loading="lazy"><component :is="event.icon" v-else-if="event.icon" aria-hidden="true" /></span>
                  <span class="plan-row__text"><strong>{{ event.title }}</strong><small>{{ timeOf(event) ? `${timeOf(event)} · ` : '' }}{{ event.subtitle }}</small></span>
                  <span class="plan-row__state">{{ stateOf(event)?.label }}</span>
                </button>
              </slot>
            </template>
          </div>
        </section>
        <InfiniteScrollTrigger :has-more="shownGroups.length < grouped.length" :loading="loading" @load="visibleDays += DAYS_PAGE" />
      </div>
    </div>

    <UiEmptyState v-if="!loading && !shown.length && displayView !== 'week'" :title="emptyTitle" :message="searching ? 'Rien ne correspond à cette recherche.' : 'Rien de prévu sur cette période.'" compact />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { CalendarCheck, ChevronLeft, ChevronRight } from '@lucide/vue';
import { addDays, addWeeks, format, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMediaQuery, useSwipe } from '@vueuse/core';
import CalendarPeriodPicker from '@/components/calendar/CalendarPeriodPicker.vue';
import InfiniteScrollTrigger from '@/components/ui/InfiniteScrollTrigger.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import PageTools from '@/components/ui/PageTools.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import { usePreference } from '@/composables/usePreference';
import { formatLongDay, formatMonthYear, formatTime } from '@/utils/format';
import { buildMonthGrid, localIso } from '@/utils/timeBuckets';

import { periodBounds, type PlanEvent, type PlanState, type PlanView } from './plan/types';

export type { PlanEvent, PlanState, PlanView } from './plan/types';
const props = withDefaults(
  defineProps<{
    events: PlanEvent[];
    states: PlanState[];
    cursor: Date;
    /** Recherche en cours : Agenda, sans navigation de periode. */
    searching?: boolean;
    /** Ce que couvre la recherche (« d’octobre 2026 à janvier 2028 »). */
    searchScope?: string;
    /** Cle de preference de la vue ; une variante `.compact` est retenue pour le telephone. */
    preferenceKey?: string;
    /** Ce qu'on compte par jour, au singulier et au pluriel. */
    unit?: [string, string];
    loading?: boolean;
    error?: string;
    emptyTitle?: string;
  }>(),
  { searching: false, searchScope: '', preferenceKey: 'plan.view', unit: () => ['élément', 'éléments'], loading: false, error: '', emptyTitle: 'Rien de prévu' },
);
const emit = defineEmits<{
  'update:cursor': [date: Date];
  'update:view': [view: PlanView];
  open: [event: PlanEvent];
  retry: [];
}>();

const WEEK_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAYS_PAGE = 7;
const todayStr = localIso(new Date());

/* Une preference par format d'ecran : la grille mensuelle ne tient pas sous 640px, et
   choisir la semaine sur telephone ne doit pas imposer la semaine sur grand ecran. */
const compact = useMediaQuery('(max-width:640px)');
const desktopView = usePreference(props.preferenceKey, 'month');
const compactView = usePreference(`${props.preferenceKey}.compact`, 'agenda');
function initialView(): PlanView {
  const wanted = compact.value ? compactView.value : desktopView.value;
  if (wanted === 'agenda' || wanted === 'week') return wanted;
  return wanted === 'month' && !compact.value ? 'month' : 'agenda';
}
const view = ref<PlanView>(initialView());
const viewOptions = computed(() => [
  { value: 'agenda', label: 'Agenda' },
  { value: 'week', label: 'Semaine' },
  ...(compact.value ? [] : [{ value: 'month', label: 'Mois' }]),
]);
const displayView = computed<PlanView>(() => (props.searching ? 'agenda' : view.value));
watch(view, (value) => {
  if (compact.value) compactView.value = value;
  else desktopView.value = value;
  emit('update:view', value);
}, { immediate: true });
function setView(value: string): void {
  if (value === 'agenda' || value === 'week' || (value === 'month' && !compact.value)) {
    slideDirection.value = '';
    view.value = value;
  }
}
watch(compact, () => { view.value = initialView(); });

/* Periode */
const weekStart = computed(() => startOfWeek(props.cursor, { weekStartsOn: 1 }));
const periodLabel = computed(() => {
  if (view.value !== 'week') return formatMonthYear(props.cursor);
  const start = weekStart.value, end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const withYear = end.getFullYear() !== new Date().getFullYear();
  return `${format(start, sameMonth ? 'd' : 'd MMM', { locale: fr })} – ${format(end, withYear ? 'd MMM yyyy' : 'd MMM', { locale: fr })}`;
});
const previousLabel = computed(() => (view.value === 'week' ? 'Semaine précédente' : 'Mois précédent'));
const nextLabel = computed(() => (view.value === 'week' ? 'Semaine suivante' : 'Mois suivant'));
const periodKey = computed(() => (props.searching ? 'search' : `${view.value}:${localIso(periodBounds(view.value, props.cursor).start)}`));

/* Sens du dernier deplacement, pour faire glisser la nouvelle periode du bon cote. */
const slideDirection = ref<'' | 'next' | 'previous'>('');
const visibleDays = ref(DAYS_PAGE);
function move(delta: number): void {
  if (props.searching) return;
  slideDirection.value = delta > 0 ? 'next' : 'previous';
  visibleDays.value = DAYS_PAGE;
  emit('update:cursor', view.value === 'week' ? addWeeks(props.cursor, delta) : new Date(props.cursor.getFullYear(), props.cursor.getMonth() + delta, 1));
}
function jumpTo(date: Date): void {
  slideDirection.value = date > props.cursor ? 'next' : 'previous';
  visibleDays.value = DAYS_PAGE;
  emit('update:cursor', date);
}
let scrollToTodayPending = true;
function goToday(): void {
  slideDirection.value = '';
  visibleDays.value = DAYS_PAGE;
  scrollToTodayPending = true;
  emit('update:cursor', new Date());
}

/* Evenements */
const stateMap = computed(() => new Map(props.states.map((state) => [state.key, state])));
const stateOf = (event: PlanEvent) => stateMap.value.get(event.state);
const stateStyle = (event: PlanEvent) => ({ '--state-color': stateOf(event)?.color || 'var(--muted)' });
const describe = (event: PlanEvent) => `${event.title}${event.subtitle ? ` — ${event.subtitle}` : ''}${stateOf(event) ? ` (${stateOf(event)!.label})` : ''}`;
function timeOf(event: PlanEvent): string {
  if (!event.date || event.date.endsWith('T00:00:00Z') || event.date.endsWith('T00:00:00.000Z') || event.date.length <= 10) return '';
  return formatTime(event.date, '');
}
const shown = computed(() => props.events);
const eventsByDate = computed(() => {
  const map = new Map<string, PlanEvent[]>();
  for (const event of shown.value) {
    const key = event.date.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(event);
  }
  return map;
});
const grouped = computed(() => [...eventsByDate.value].sort(([a], [b]) => a.localeCompare(b)).map(([date, events]) => ({ date, events })));
const shownGroups = computed(() => grouped.value.slice(0, visibleDays.value));
const legend = computed(() => props.states
  .map((state) => ({ ...state, count: shown.value.filter((event) => event.state === state.key).length }))
  .filter((state) => state.count));
const monthCells = computed(() => buildMonthGrid(props.cursor).map((day) => ({ ...day, key: day.date, events: eventsByDate.value.get(day.date) || [] })));
const weekDays = computed(() => Array.from({ length: 7 }, (_, index) => {
  const date = addDays(weekStart.value, index), key = localIso(date);
  return { date: key, day: date.getDate(), weekday: format(date, 'EEE', { locale: fr }), events: eventsByDate.value.get(key) || [] };
}));
watch(() => props.searching, () => { visibleDays.value = DAYS_PAGE; });

function revealDate(date: string): boolean {
  const index = grouped.value.findIndex((group) => group.date >= date);
  if (index < 0) return false;
  if (index >= visibleDays.value) visibleDays.value = index + DAYS_PAGE;
  nextTick(() => document.getElementById(`plan-date-${grouped.value[index].date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  return true;
}
function showDay(date: string): void {
  view.value = 'agenda';
  revealDate(date);
}
/* Defilement vers aujourd'hui une fois les evenements arrives (premier affichage et
   bouton « Aujourd'hui »). */
watch(() => props.events, () => {
  if (!scrollToTodayPending || props.loading || displayView.value !== 'agenda') return;
  scrollToTodayPending = false;
  nextTick(() => setTimeout(() => revealDate(todayStr), 100));
});

/* Balayage horizontal : periode suivante ou precedente. Ignore quand le doigt part d'une
   zone qui defile deja de cote, et quand le geste est surtout vertical. */
const swipeArea = ref<HTMLElement | null>(null);
let swipeIgnored = false;
function insideHorizontalScroller(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== swipeArea.value) {
    const { overflowX } = getComputedStyle(node);
    if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1) return true;
    node = node.parentElement;
  }
  return false;
}
const { lengthX, lengthY } = useSwipe(swipeArea, {
  threshold: 50,
  onSwipeStart: (event) => { swipeIgnored = props.searching || insideHorizontalScroller(event.target); },
  onSwipeEnd: (_event, direction) => {
    if (swipeIgnored) return;
    if (Math.abs(lengthX.value) < 70 || Math.abs(lengthY.value) > Math.abs(lengthX.value) * 0.6) return;
    if (direction === 'left') move(1);
    else if (direction === 'right') move(-1);
  },
});

</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

/* Styles repris du calendrier en production (CalendarView). */
.plan { min-width: 0; }
.calendar-navigation { display: flex; align-items: center; gap: var(--space-1); }
.calendar-today-icon { display: none; width: 16px; height: 16px; }
.calendar-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); margin-bottom: var(--space-3); }
.calendar-view-switch :deep(button) { gap: var(--space-2); min-width: 92px; }
.calendar-search-scope { margin: 0; color: var(--muted); font-size: var(--fs-sm); }

.calendar-legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: var(--fs-xs); }
.calendar-legend li { display: flex; align-items: center; gap: var(--space-1); }
.calendar-legend small { color: var(--text); font-weight: 700; font-size: var(--fs-xs); }
.calendar-legend i { width: 8px; height: 8px; border-radius: 50%; background: var(--state-color); }

.calendar-period.slide-next { animation: calendar-slide-next var(--motion-duration-fast, 180ms) var(--motion-ease-standard, ease-out); }
.calendar-period.slide-previous { animation: calendar-slide-previous var(--motion-duration-fast, 180ms) var(--motion-ease-standard, ease-out); }
@keyframes calendar-slide-next { from { opacity: 0; transform: translateX(24px); } }
@keyframes calendar-slide-previous { from { opacity: 0; transform: translateX(-24px); } }
@media (prefers-reduced-motion: reduce) { .calendar-period { animation: none !important; } }

.month-calendar-shell { max-width: 100%; overflow-x: auto; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); scrollbar-width: thin; overscroll-behavior-x: contain; }
.month-calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); min-width: 0; }
.month-weekday { position: sticky; top: 0; z-index: 2; padding: 8px; text-align: center; border-bottom: 1px solid var(--border); background: var(--surface); color: var(--muted); font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; }
.month-cell { min-width: 0; min-height: 132px; padding: 8px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); background: rgb(var(--ink) / 0.008); overflow: hidden; }
.month-cell:nth-child(7n) { border-right: 0; }
.month-cell:nth-last-child(-n+7) { border-bottom: 0; }
.month-cell.outside { opacity: 0.35; }
.month-cell.today { background: color-mix(in srgb, var(--accent) 6%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent); }
.month-cell header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0 var(--space-1); margin-bottom: 6px; }
.month-cell header > span { color: var(--text); font-weight: 700; white-space: nowrap; }
.month-cell header small { color: var(--accent); font-size: var(--fs-xs); }
.month-event, .month-more { display: flex; align-items: center; gap: var(--space-1); width: 100%; min-width: 0; margin: 3px 0; padding: 4px 5px; border: 0; border-left: 2px solid var(--state-color, var(--muted)); border-radius: var(--radius-xs); background: rgb(var(--ink) / 0.035); color: var(--text); font-size: var(--fs-xs); text-align: left; cursor: pointer; }
.month-event span { flex: 0 0 auto; font-size: var(--fs-xs); }
.month-event-icon { flex: 0 0 auto; width: 12px; height: 12px; color: var(--muted); }
.month-event strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-xs); }
.month-more { display: block; border: 0; background: transparent; color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.week-calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); overflow: hidden; }
.week-day { display: flex; flex-direction: column; min-width: 0; min-height: 320px; border-right: 1px solid var(--border); }
.week-day:last-child { border-right: 0; }
.week-day.today { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.week-day-header { display: flex; align-items: baseline; gap: 6px; min-width: 0; padding: 10px 10px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.week-day-name { color: var(--muted); font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; }
.week-day-number { color: var(--text); font-size: var(--fs-lg); font-weight: 700; line-height: 1; }
.week-day-header small { overflow: hidden; color: var(--accent); font-size: var(--fs-xs); font-weight: 700; text-overflow: ellipsis; }
.week-day.today .week-day-number { color: var(--accent); }
.week-events { display: flex; flex-direction: column; gap: 6px; padding: 8px; }
.week-event { display: flex; align-items: flex-start; gap: 8px; width: 100%; min-width: 0; padding: 6px; border: 0; border-left: 3px solid var(--state-color); border-radius: var(--radius-xs); background: rgb(var(--ink) / 0.04); color: var(--text); text-align: left; cursor: pointer; }
.week-event:hover { background: var(--surface-hover); }
.week-event:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.week-event-poster { flex: 0 0 32px; height: 48px; display: none; place-items: center; overflow: hidden; border-radius: 3px; background: var(--surface-2); color: var(--muted); }
.week-event-poster img { width: 100%; height: 100%; object-fit: cover; }
.week-event-poster svg { width: 16px; height: 16px; }
.week-event-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.week-event-text strong { display: -webkit-box; overflow: hidden; font-size: var(--fs-xs); line-height: 1.3; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.week-event-text small { display: -webkit-box; overflow: hidden; color: var(--muted); font-size: var(--fs-xs); line-height: 1.35; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.week-event-icon { width: 11px; height: 11px; margin-right: 3px; vertical-align: -1px; }
.week-event-text em { color: var(--state-color); font-size: var(--fs-xs); font-style: normal; font-weight: 700; }
.week-empty { margin: 0; padding: 4px 2px; color: var(--muted); font-size: var(--fs-xs); opacity: 0.7; }

.calendar-agenda { display: flex; flex-direction: column; gap: var(--space-5); width: 100%; }
.calendar-day { display: flex; flex-direction: column; gap: var(--space-3); width: 100%; padding-bottom: var(--space-4); border-bottom: 1px solid var(--border); scroll-margin-top: var(--space-6); }
.calendar-day:last-child { border-bottom: 0; }
.calendar-day-header { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; width: 100%; }
.calendar-day-header h2 { margin: 0; font-size: var(--fs-lg); font-weight: 700; color: var(--text); line-height: 1.25; text-transform: capitalize; }
.calendar-day-sub { display: flex; align-items: center; gap: var(--space-2); }
.day-event-count { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.today-badge { display: inline-flex; padding: 2px 8px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); font-size: var(--fs-xs); font-weight: 700; }
.calendar-events { display: flex; flex-direction: column; gap: var(--space-2); width: 100%; }

/* Ligne d'Agenda par defaut, quand la page ne fournit pas de carte plus riche. */
.plan-row { display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-left: 3px solid var(--state-color); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.plan-row:hover { background: var(--surface-hover); }
.plan-row__poster { display: grid; flex: none; place-items: center; width: 32px; aspect-ratio: 2 / 3; overflow: hidden; border-radius: 3px; background: var(--surface-2); color: var(--muted); }
.plan-row__poster img { width: 100%; height: 100%; object-fit: cover; }
.plan-row__poster svg { width: 16px; height: 16px; }
.plan-row__text { display: grid; flex: 1; gap: 2px; min-width: 0; }
.plan-row__text small { color: var(--muted); font-size: var(--fs-xs); }
.plan-row__state { flex: none; color: var(--state-color); font-size: var(--fs-xs); font-weight: 700; }

@container page (max-width: 757px) {
  .month-calendar { min-width: 600px; }
  .month-cell { min-height: 112px; padding: 6px; }
  .week-calendar { grid-template-columns: 1fr; }
  .week-day { flex-direction: row; min-height: 0; border-right: 0; border-bottom: 1px solid var(--border); }
  .week-day:last-child { border-bottom: 0; }
  .week-day-header { flex: 0 0 64px; flex-direction: column; align-items: center; justify-content: flex-start; gap: 2px; padding: 12px 6px; border-bottom: 0; border-right: 1px solid var(--border); text-align: center; }
  .week-events { flex: 1; min-width: 0; }
  .week-event-poster { display: grid; }
  .week-event-text strong { font-size: var(--fs-sm); }
  .week-day.is-empty .week-events { justify-content: center; }
  .week-day-header small { display: none; }
}

@include bp.until(tablet) {
  .calendar-navigation { width: 100%; justify-content: space-between; }
  .calendar-navigation :deep(.period-trigger) { min-width: 0; flex: 1; padding: 0 4px; }
  .calendar-today-icon { display: block; }
  .calendar-today-label { display: none; }
  .calendar-toolbar { flex-direction: column; align-items: stretch; }
}
</style>
