<template>
    <AppPage title="Calendrier" v-model:query="search" placeholder="Filtrer les titres" has-filters :active-count="activeFilterCount" :filters-open="filtersOpen" @toggle-filters="toggleFilters" page-class="calendar-page">

      <template #tools>
        <div class="calendar-navigation">
          <UiButton variant="ghost" icon-only :disabled="searching" :title="previousLabel" :aria-label="previousLabel" @click="move(-1)"><ChevronLeft/></UiButton>
          <CalendarPeriodPicker :model-value="cursor" :label="periodLabel" @update:model-value="jumpTo" />
          <UiButton variant="ghost" icon-only :disabled="searching" :title="nextLabel" :aria-label="nextLabel" @click="move(1)"><ChevronRight/></UiButton>
          <UiButton class="calendar-today" title="Aujourd'hui" aria-label="Aujourd'hui" @click="today"><CalendarCheck class="calendar-today-icon" aria-hidden="true" /><span class="calendar-today-label">Aujourd'hui</span></UiButton>
        </div>
      </template>

    <div class="psh-layout">
      <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
        <FilterGroup label="Type de média">
          <UiChipGroup label="Type de média" :options="[{ value: '', label: 'Films et séries' }, { value: 'movie', label: 'Films' }, { value: 'episode', label: 'Séries' }]" v-model="type" />
        </FilterGroup>
        <FilterGroup label="État">
          <UiChipGroup label="État" :options="stateOptions" v-model="state" />
        </FilterGroup>
        <FilterGroup label="Version">
          <UiChipGroup label="Version" :options="vfOptions" v-model="vf" />
        </FilterGroup>
        <FilterGroup v-if="sourceOptions.length > 2" label="Origine">
          <UiChipGroup label="Origine" :options="sourceOptions" v-model="source" />
        </FilterGroup>
        <FilterGroup v-if="requesterOptions.length > 2" label="Demandeur">
          <UiChipGroup label="Demandeur" :options="requesterOptions" v-model="requester" />
        </FilterGroup>
        <FilterGroup label="Suivi">
          <UiChipGroup label="Suivi" :options="[{ value: false, label: 'Tout' }, { value: true, label: 'Suivis uniquement' }]" v-model="tracked" />
        </FilterGroup>
      </FilterSidebar>
      <div ref="swipeArea" class="psh-main">
    <div class="calendar-toolbar">
      <UiSegmentedControl v-if="!searching" class="calendar-view-switch" :model-value="view" :options="viewOptions" :ariaLabel="'Mode d’affichage'" @update:model-value="setView" />
      <p v-else class="calendar-search-scope" role="status">
        {{ filtered.length }} résultat{{ filtered.length > 1 ? 's' : '' }} de {{ searchScopeLabel }}
      </p>

      <ul v-if="legend.length" class="calendar-legend" aria-label="Légende">
        <li v-for="item in legend" :key="item.state"><i :class="`state-${item.state}`"></i>{{ item.label }} <small>{{ item.count }}</small></li>
      </ul>
    </div>
    <UiFeedback v-if="error" type="error" title="Calendrier indisponible" :message="error" retry @retry="load" />

    <div :key="periodKey" class="calendar-period" :class="slideDirection ? `slide-${slideDirection}` : ''">
    <!-- Vue Grille Mensuelle -->
    <div v-if="displayView==='month'" class="month-calendar-shell" tabindex="0" aria-label="Calendrier mensuel, défilement horizontal disponible">
      <div class="month-calendar">
        <div v-for="label in weekLabels" :key="label" class="month-weekday">{{ label }}</div>
        <div v-for="cell in monthCells" :key="cell.key" class="month-cell" :class="{outside:!cell.current,today:cell.date===todayStr}">
          <header><span>{{ cell.day }}</span><small v-if="cell.date===todayStr">Aujourd'hui</small></header>
          <button v-for="event in cell.events.slice(0,3)" :key="eventKey(event)" class="month-event" :class="`state-${stateOf(event)}`" :title="`${event.title} — ${event.subtitle} (${STATE_LABELS[stateOf(event)]})`" @click="openDetail(event)"><component :is="releaseIcon(event)" v-if="event.type==='movie'" class="month-event-icon" aria-hidden="true" /><span v-if="formatTime(event.date)">{{ formatTime(event.date) }}</span><strong>{{ event.title }}</strong></button>
          <button v-if="cell.events.length>3" class="month-more" @click="showDay(cell.date)">+ {{ cell.events.length-3 }} autre{{ cell.events.length>4?'s':'' }}</button>
        </div>
      </div>
    </div>

    <!-- Vue Semaine : sept colonnes, ou sept jours empiles quand la place manque -->
    <div v-else-if="displayView==='week'" class="week-calendar">
      <section v-for="day in weekDays" :key="day.date" class="week-day" :class="{ today: day.date===todayStr, 'is-empty': !day.events.length }" :aria-label="longDate(day.date)">
        <header class="week-day-header">
          <span class="week-day-name">{{ day.weekday }}</span>
          <span class="week-day-number">{{ day.day }}</span>
          <small v-if="day.date===todayStr">Aujourd'hui</small>
        </header>
        <div class="week-events">
          <button
            v-for="event in day.events"
            :key="eventKey(event)"
            type="button"
            class="week-event"
            :class="`state-${stateOf(event)}`"
            :title="`${event.title} — ${event.subtitle} (${STATE_LABELS[stateOf(event)]})`"
            @click="openDetail(event)"
          >
            <span class="week-event-poster">
              <img v-if="event.poster_url" :src="event.poster_url" alt="" loading="lazy" decoding="async">
              <component :is="releaseIcon(event)" v-else aria-hidden="true" />
            </span>
            <span class="week-event-text">
              <strong>{{ event.title }}</strong>
              <small><component :is="releaseIcon(event)" class="week-event-icon" aria-hidden="true" />{{ formatTime(event.date) ? `${formatTime(event.date)} · ` : '' }}{{ event.subtitle }}</small>
              <em v-if="stateOf(event) !== 'upcoming'">{{ STATE_LABELS[stateOf(event)] }}</em>
            </span>
          </button>
          <p v-if="!day.events.length" class="week-empty">Rien de prévu</p>
        </div>
      </section>
    </div>

    <!-- Vue Agenda (et résultats de recherche) -->
    <div v-else class="calendar-agenda">
      <section v-for="group in shownGroups" :key="group.date" :id="'date-' + group.date" class="calendar-day" :class="{today:group.date===todayStr}">
        <div class="calendar-day-header">
          <h2>{{ longDate(group.date) }}</h2>
          <div class="calendar-day-sub">
            <span v-if="group.date===todayStr" class="today-badge">Aujourd'hui</span>
            <span class="day-event-count">{{ group.events.length }} sortie{{ group.events.length > 1 ? 's' : '' }}</span>
          </div>
        </div>

        <div class="calendar-events">
          <CalendarEventCard
            v-for="event in group.events"
            :key="eventKey(event)"
            :event="event"
            :time="formatTime(event.date)"
            :now="now"
            @open="openDetail"
            @play="openPlex"
          />
        </div>
      </section>

      <LoadMore
        :has-more="shownGroups.length < grouped.length"
        :label="`Afficher plus de jours (${shownGroups.length} sur ${grouped.length})`"
        @load="visibleDays += DAYS_PAGE"
      />
      <InfiniteScrollTrigger
        :has-more="shownGroups.length < grouped.length"
        :loading="loading"
        @load="visibleDays += DAYS_PAGE"
      />
    </div>
    </div><!-- .calendar-period -->

    <UiEmptyState v-if="!loading && !filtered.length && displayView!=='week'" title="Aucune sortie" :message="searching ? 'Aucune sortie ne correspond à cette recherche.' : 'Aucune sortie sur cette période.'" compact />
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->
  </AppPage>
</template>

<script setup lang="ts">
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import CalendarEventCard from '@/components/calendar/CalendarEventCard.vue';
import CalendarPeriodPicker from '@/components/calendar/CalendarPeriodPicker.vue';
import { formatLongDay as longDate, formatMonthYear, formatTime as formatClockTime } from '@/utils/format';
import { buildMonthGrid, localIso, monthBounds } from '@/utils/timeBuckets';
import {
  STATE_LABELS, STATE_ORDER, eventSourceGroups, eventState, releaseIcon, sourceGroupLabel,
  type CalendarEvent, type CalendarState,
} from '@/utils/calendarEvents';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CalendarCheck, ChevronLeft, ChevronRight } from '@lucide/vue';
import { addDays, addMonths, addWeeks, format, startOfMonth, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useSwipe } from '@vueuse/core';
import { api } from '@/api';
import { useRealtimeQuery } from '@/composables/useRealtimeQuery';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { openPlexLink, mediaDetailPath } from '@/mediaUrl';
import LoadMore from '@/components/ui/LoadMore.vue';
import InfiniteScrollTrigger from '@/components/ui/InfiniteScrollTrigger.vue';
import { useSession } from '@/composables/useSession';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import { usePreference } from '@/composables/usePreference';

type CalendarViewMode = 'agenda' | 'week' | 'month';

const router = useRouter();
const route = useRoute();
const { session, isAdmin, ready: sessionReady } = useSession();

const myRequestsOnly = computed(() => !isAdmin.value);
const search = ref(''), type = ref(''), tracked = ref(false), cursor = ref(new Date());
const state = ref(''), vf = ref(''), source = ref(''), requester = ref('');
const compactQuery = window.matchMedia('(max-width:640px)');
const compact = ref(compactQuery.matches);
/* Une preference par format d'ecran : la grille mensuelle ne tient pas sous 640px, et
   choisir la semaine sur telephone ne doit pas imposer la semaine sur grand ecran. */
const desktopView = usePreference('calendar.view', 'month');
const compactView = usePreference('calendar.view.compact', 'agenda');
const view = ref<CalendarViewMode>(initialView());
const viewOptions = computed(() => [
  { value: 'agenda', label: 'Agenda' },
  { value: 'week', label: 'Semaine' },
  ...(compact.value ? [] : [{ value: 'month', label: 'Mois' }]),
]);
function initialView(): CalendarViewMode {
  const wanted = compact.value ? compactView.value : desktopView.value;
  if (wanted === 'agenda' || wanted === 'week') return wanted;
  return wanted === 'month' && !compact.value ? 'month' : 'agenda';
}
function setView(value: string | number) {
  if (value === 'agenda' || value === 'week' || (value === 'month' && !compact.value)) {
    slideDirection.value = '';
    view.value = value;
  }
}

const todayStr = localIso(new Date()), weekLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
/* Repere des etats « en retard » : fige au chargement de la page, il n'a pas besoin de
   bouger a la seconde. */
const now = Date.now();

/* La recherche porte sur une large fenetre, pas sur le seul mois affiche : chercher un
   titre sans savoir quand il sort etait le cas le plus courant, et le mois courant ne
   renvoyait souvent rien. */
const searching = computed(() => search.value.trim().length >= 2);
const SEARCH_MONTHS_BEFORE = 3, SEARCH_MONTHS_AFTER = 12;
const searchBounds = (() => {
  const start = startOfMonth(addMonths(new Date(), -SEARCH_MONTHS_BEFORE));
  return { start, end: addMonths(start, SEARCH_MONTHS_BEFORE + SEARCH_MONTHS_AFTER + 1) };
})();
const searchScopeLabel = `${formatMonthYear(searchBounds.start)} à ${formatMonthYear(addDays(searchBounds.end, -1))}`;

const displayView = computed<CalendarViewMode>(() => (searching.value ? 'agenda' : view.value));
const weekStart = computed(() => startOfWeek(cursor.value, { weekStartsOn: 1 }));
const bounds = computed(() => {
  if (searching.value) return searchBounds;
  if (view.value === 'week') return { start: weekStart.value, end: addDays(weekStart.value, 7) };
  return monthBounds(cursor.value);
});
const periodLabel = computed(() => {
  if (view.value !== 'week') return formatMonthYear(cursor.value);
  const start = weekStart.value, end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const withYear = end.getFullYear() !== new Date().getFullYear();
  return `${format(start, sameMonth ? 'd' : 'd MMM', { locale: fr })} – ${format(end, withYear ? 'd MMM yyyy' : 'd MMM', { locale: fr })}`;
});
const previousLabel = computed(() => (view.value === 'week' ? 'Semaine précédente' : 'Mois précédent'));
const nextLabel = computed(() => (view.value === 'week' ? 'Semaine suivante' : 'Mois suivant'));
const periodKey = computed(() => (searching.value ? 'search' : `${view.value}:${localIso(bounds.value.start)}`));

const stateOf = (event: CalendarEvent): CalendarState => eventState(event, now);
function matchesSearch(event: CalendarEvent): boolean {
  if (!searching.value) return true;
  const needle = search.value.trim().toLowerCase();
  return event.title.toLowerCase().includes(needle) || (event.subtitle || '').toLowerCase().includes(needle);
}
/* Tout filtre sauf l'etat : la legende compte les etats de ce qui reste affichable. */
const narrowed = computed(() => events.value.filter((e: CalendarEvent) => matchesSearch(e)
  && (!type.value || e.type === type.value)
  && (!vf.value || e.vf_state === vf.value)
  && (!source.value || eventSourceGroups(e).includes(source.value))));
const filtered = computed(() => (state.value ? narrowed.value.filter(e => stateOf(e) === state.value) : narrowed.value));
const eventsByDate = computed(() => { const map = new Map<string, any[]>(); filtered.value.forEach((e: any) => { const key = e.date.slice(0, 10); if (!map.has(key)) map.set(key, []); map.get(key)!.push(e); }); return map; });
const grouped = computed(() => [...eventsByDate.value].map(([date, items]) => ({ date, events: items })));

const legend = computed(() => {
  const counts = new Map<CalendarState, number>();
  narrowed.value.forEach(e => { const s = stateOf(e); counts.set(s, (counts.get(s) || 0) + 1); });
  return STATE_ORDER.filter(s => counts.get(s)).map(s => ({ state: s, label: STATE_LABELS[s], count: counts.get(s)! }));
});

const stateOptions = [{ value: '', label: 'Tous' }, ...STATE_ORDER.map(s => ({ value: s, label: STATE_LABELS[s] }))];
const vfOptions = [
  { value: '', label: 'Toutes' },
  { value: 'vf', label: 'VF' },
  { value: 'vo', label: 'VO' },
  { value: 'unchecked', label: 'Non analysée' },
  { value: 'requested', label: 'Pas encore dans Plex' },
];
const sourceOptions = computed(() => {
  const groups = new Set<string>();
  events.value.forEach((e: CalendarEvent) => eventSourceGroups(e).forEach(g => groups.add(g)));
  if (source.value) groups.add(source.value);
  return [{ value: '', label: 'Toutes' }, ...[...groups].sort().map(g => ({ value: g, label: sourceGroupLabel(g) }))];
});
/* Le filtre demandeur est reserve aux administrateurs : les autres ne voient deja que
   leurs propres demandes. */
const requestersQuery = useQuery({
  queryKey: ['discover', 'requesters'],
  queryFn: () => api<any[]>('/api/discover/requesters'),
  enabled: computed(() => sessionReady.value && isAdmin.value),
  staleTime: 60_000,
});
const requesterOptions = computed(() => {
  if (!isAdmin.value) return [];
  const users = (requestersQuery.data.value || []).filter((u: any) => u.plex_user_id);
  return [{ value: '', label: 'Tous' }, ...users.map((u: any) => ({ value: u.plex_user_id, label: u.custom_name || u.display_name || u.plex_user_id }))];
});

const DAYS_PAGE = 7;
const visibleDays = ref(DAYS_PAGE);
const shownGroups = computed(() => grouped.value.slice(0, visibleDays.value));
watch([search, type, tracked, state, vf, source, requester], () => { visibleDays.value = DAYS_PAGE; });

const monthCells = computed(() => buildMonthGrid(cursor.value).map(day => ({
  ...day,
  key: day.date,
  events: eventsByDate.value.get(day.date) || [],
})));
const weekDays = computed(() => Array.from({ length: 7 }, (_, index) => {
  const date = addDays(weekStart.value, index), key = localIso(date);
  return { date: key, day: date.getDate(), weekday: format(date, 'EEE', { locale: fr }), events: eventsByDate.value.get(key) || [] };
}));

const { filtersOpen, activeCount: activeFilterCount, toggle: toggleFilters, close: closeFilters, reset: resetFiltersDrawer } = useFiltersDrawer(
  { search, type, tracked, state, vf, source, requester },
  { search: '', type: '', tracked: false, state: '', vf: '', source: '', requester: '' },
  {
    memoriser: 'calendrier',
    onReset: () => {
      visibleDays.value = DAYS_PAGE;
    },
  }
);
function resetFilters(): void {
  resetFiltersDrawer();
}
watch(view, value => { if (compact.value) compactView.value = value; else desktopView.value = value; });

function formatTime(v: string): string { if (!v || v.endsWith('T00:00:00Z') || v.endsWith('T00:00:00.000Z')) return ''; return formatClockTime(v, ''); }
function eventKey(event: any): string { return `${event.instance}:${event.date}:${event.title}:${event.subtitle}`; }

function openDetail(event: any): void {
  if (event.library_item_id) ouvrirFiche(router, mediaDetailPath({ id: event.library_item_id }, 'library'), route.fullPath);
  else if (event.request_id) ouvrirFiche(router, mediaDetailPath({ id: event.request_id }, 'request'), route.fullPath);
}

function openPlex(event: any, e?: Event): void {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  if (event.plex_guid) {
    openPlexLink(event.plex_guid);
  } else {
    openDetail(event);
  }
}

function revealDate(date: string): boolean { const i = grouped.value.findIndex(g => g.date === date); if (i < 0) return false; if (i >= visibleDays.value) visibleDays.value = i + DAYS_PAGE; return true; }
function scrollToDate(date: string): void { if (!revealDate(date)) return; nextTick(() => document.getElementById(`date-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
function showDay(date: string): void { view.value = 'agenda'; scrollToDate(date); }
/* Les evenements de la periode affichee. Tout ce qui les determine (periode, « suivis
   uniquement », demandeur) entre dans la cle : changer de periode ou de filtre relance
   d'elle-meme, et revenir sur une periode deja vue la repeint aussitot. Les autres
   filtres trient la periode deja chargee. */
const calendarUrl = computed(() => {
  const user = myRequestsOnly.value ? session.value?.plex_user_id : requester.value;
  const userParam = user ? `&user=${encodeURIComponent(user)}` : '';
  return `/api/calendar?start=${localIso(bounds.value.start)}&end=${localIso(bounds.value.end)}&tracked_only=${tracked.value}${userParam}`;
});
const calendarKey = computed(() => ['calendar', calendarUrl.value]);
const calendarQuery = useQuery({
  queryKey: calendarKey,
  queryFn: ({ signal }) => api<any[]>(calendarUrl.value, { signal }),
  enabled: sessionReady,
  // Garder la periode precedente pendant le chargement de la suivante, plutot qu'une grille vide.
  placeholderData: keepPreviousData,
  staleTime: 60_000,
});
const events = computed<any[]>(() => calendarQuery.data.value || []);
const loading = computed(() => calendarQuery.isFetching.value);
const error = computed(() => (calendarQuery.error.value as Error | null)?.message || '');

/* Defilement vers aujourd'hui une fois les evenements arrives (premier affichage et
   bouton « Aujourd'hui »). */
let scrollToTodayPending = false;
watch(events, () => {
  if (!scrollToTodayPending || calendarQuery.isPlaceholderData.value) return;
  scrollToTodayPending = false;
  if (displayView.value !== 'agenda') return;
  nextTick(() => setTimeout(() => {
    const target = grouped.value.find(g => g.date >= todayStr);
    if (target) scrollToDate(target.date);
  }, 100));
});

/** Relit la periode affichee ; une lecture deja partie (nouvelle cle) n'est pas doublee. */
async function load({ scrollToToday = false }: { scrollToToday?: boolean } = {}): Promise<void> {
  if (scrollToToday) scrollToTodayPending = true;
  await nextTick();
  if (!calendarQuery.isFetching.value) await calendarQuery.refetch();
}

/* Sens du dernier deplacement, pour faire glisser la nouvelle periode du bon cote. */
const slideDirection = ref<'' | 'next' | 'previous'>('');
function move(delta: number): void {
  if (searching.value) return;
  slideDirection.value = delta > 0 ? 'next' : 'previous';
  cursor.value = view.value === 'week'
    ? addWeeks(cursor.value, delta)
    : new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1);
  visibleDays.value = DAYS_PAGE;
  load({ scrollToToday: false });
}
function jumpTo(date: Date): void {
  slideDirection.value = date > cursor.value ? 'next' : 'previous';
  cursor.value = date;
  visibleDays.value = DAYS_PAGE;
  load({ scrollToToday: false });
}
function today(): void {
  if (searching.value) search.value = '';
  slideDirection.value = '';
  cursor.value = new Date();
  visibleDays.value = DAYS_PAGE;
  load({ scrollToToday: true });
}
function applyCompact(matches: boolean): void {
  if (matches === compact.value) return;
  compact.value = matches;
  view.value = initialView();
}
function syncCompact(): void { applyCompact(compactQuery.matches); }

/* Balayage horizontal (ecrans tactiles) : periode suivante ou precedente. Ignore quand
   le doigt part d'une zone qui defile deja de cote (grille mensuelle etroite, rangees
   de pastilles), et quand le geste est surtout vertical. */
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
  onSwipeStart: (e) => { swipeIgnored = searching.value || insideHorizontalScroller(e.target); },
  onSwipeEnd: (_e, direction) => {
    if (swipeIgnored) return;
    if (Math.abs(lengthX.value) < 70 || Math.abs(lengthY.value) > Math.abs(lengthX.value) * 0.6) return;
    if (direction === 'left') move(1);
    else if (direction === 'right') move(-1);
  },
});

onMounted(async () => {
  compact.value = !compactQuery.matches; syncCompact();
  compactQuery.addEventListener('change', syncCompact); window.addEventListener('resize', syncCompact);
  if (!sessionReady.value) { await new Promise<void>(resolve => { const stop = watch(sessionReady, v => { if (v) { stop(); resolve(); } }); }); }
  load({ scrollToToday: true });
});

// Un evenement met a jour chaque occurrence du media dans le cache ; faute de
// correspondance, la periode est relue.
useRealtimeQuery<any[]>(calendarKey, ['request.updated', 'download.updated'], {
  keyFields: ['request_id', 'id', 'tvdb_id', 'tmdb_id'],
  patchAll: true,
  mapper: (payload: any) => {
    const data = { ...payload };
    if (payload.status === 'available' || payload.has_file !== undefined) {
      data.has_file = payload.has_file ?? (payload.status === 'available');
    }
    return data;
  },
});
onBeforeUnmount(() => { compactQuery.removeEventListener('change', syncCompact); window.removeEventListener('resize', syncCompact); });
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.calendar-navigation { display: flex; align-items: center; gap: var(--space-1); }
.calendar-today-icon { display: none; width: 16px; height: 16px; }

.calendar-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); margin-bottom: var(--space-3); }
.calendar-view-switch button { gap: var(--space-2); min-width: 92px; }
.calendar-search-scope { margin: 0; color: var(--muted); font-size: var(--fs-sm); }

/* Couleur de chaque etat, partagee par la legende, la grille et la semaine. */
.state-available { --state-color: var(--success); }
.state-downloading { --state-color: var(--blue); }
.state-late { --state-color: var(--danger); }
.state-released { --state-color: var(--muted); }
.state-upcoming { --state-color: var(--accent); }

.calendar-legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: var(--fs-xs); }
.calendar-legend li { display: flex; align-items: center; gap: var(--space-1); }
.calendar-legend small { color: var(--text); font-weight: 700; font-size: var(--fs-xs); }
.calendar-legend i { width: 8px; height: 8px; border-radius: 50%; background: var(--state-color); }

/* Nouvelle periode : glisse du cote d'ou elle vient. */
.calendar-period.slide-next { animation: calendar-slide-next var(--motion-duration-fast, 180ms) var(--motion-ease-standard, ease-out); }
.calendar-period.slide-previous { animation: calendar-slide-previous var(--motion-duration-fast, 180ms) var(--motion-ease-standard, ease-out); }
@keyframes calendar-slide-next { from { opacity: 0; transform: translateX(24px); } }
@keyframes calendar-slide-previous { from { opacity: 0; transform: translateX(-24px); } }
@media (prefers-reduced-motion: reduce) { .calendar-period { animation: none !important; } }

/* Vue Grille Mensuelle */
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

/* Vue Semaine */
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

/* Vue Agenda */
.calendar-agenda { display: flex; flex-direction: column; gap: var(--space-5); width: 100%; }
.calendar-day { display: flex; flex-direction: column; gap: var(--space-3); width: 100%; padding-bottom: var(--space-4); border-bottom: 1px solid var(--border); }
.calendar-day:last-child { border-bottom: 0; }
.calendar-day-header { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; width: 100%; }
.calendar-day-header h2 { margin: 0; font-size: var(--fs-lg); font-weight: 700; color: var(--text); line-height: 1.25; text-transform: capitalize; }
.calendar-day-sub { display: flex; align-items: center; gap: var(--space-2); }
.day-event-count { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.today-badge { display: inline-flex; padding: 2px 8px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); font-size: var(--fs-xs); font-weight: 700; }
.calendar-events { display: flex; flex-direction: column; gap: var(--space-2); width: 100%; }

/* Place etroite : la semaine devient une liste de jours, un jour par ligne, et les
   affiches, trop serrees dans sept colonnes, y reviennent. */
@container page (max-width: 757px) {
  /* 600px et non 760 : une tablette en portrait n'offre que 620 a 660px une fois le
     rail lateral deduit, et le mois y defilait horizontalement. */
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
  /* Sur telephone, « Aujourd'hui » en toutes lettres poussait le bouton hors de l'ecran. */
  .calendar-today-icon { display: block; }
  .calendar-today-label { display: none; }
  .calendar-toolbar { flex-direction: column; align-items: stretch; }
}
</style>
