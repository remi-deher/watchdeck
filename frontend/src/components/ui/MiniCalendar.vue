<template>
  <!-- Mini-calendrier : les dates d'un element (sorties d'un film, episodes d'une serie…)
       en liste, regroupees par mois. Une liste plutot qu'une grille : ces dates sont
       souvent espacees de plusieurs semaines. Chaque type de date a sa couleur et son
       icone (cinema, streaming, physique, episode) ; le passe s'estompe, et un repere
       « Aujourd'hui » separe ce qui est passe de ce qui vient. -->
  <div class="mini-calendar">
    <ol v-if="months.length" class="mini-calendar__months">
      <li v-for="month in months" :key="month.key" class="mini-calendar__month">
        <h3>{{ month.label }}</h3>
        <ol class="mini-calendar__dates">
          <template v-for="entry in month.entries" :key="entry.key">
            <li v-if="entry.key === firstUpcomingKey && hasPast" class="mini-calendar__today" aria-label="Aujourd’hui"><span>Aujourd’hui</span></li>
            <li class="mini-date" :class="[`is-${entry.kind || 'other'}`, { 'is-past': entry.past }]" :style="{ '--kind-color': KINDS[entry.kind || 'other'].color }">
              <span class="mini-date__day" aria-hidden="true"><strong>{{ entry.day }}</strong><small>{{ entry.weekday }}</small></span>
              <span class="mini-date__icon" :title="KINDS[entry.kind || 'other'].label"><component :is="KINDS[entry.kind || 'other'].icon" aria-hidden="true" /></span>
              <span class="mini-date__text">
                <strong>{{ entry.title }}</strong>
                <small><span class="sr-only">{{ entry.longDate }} · </span>{{ KINDS[entry.kind || 'other'].label }}<template v-if="entry.subtitle"> · {{ entry.subtitle }}</template></small>
              </span>
              <span class="mini-date__when">{{ entry.relative }}</span>
            </li>
          </template>
        </ol>
      </li>
    </ol>
    <UiEmptyState v-else :title="emptyTitle" compact />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CalendarDays, Clapperboard, Disc3, MonitorPlay, Tv } from '@lucide/vue';
import { differenceInCalendarDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import UiEmptyState from './UiEmptyState.vue';
import { parseApiDate } from '@/utils/format';

/** Type d'une date : il choisit la couleur et l'icone. */
export type MiniCalendarKind = 'cinema' | 'streaming' | 'physical' | 'episode' | 'other';

export interface MiniCalendarEntry {
  key: string;
  /** Date (ISO). */
  date: string;
  title: string;
  subtitle?: string;
  kind?: MiniCalendarKind;
}

const props = withDefaults(defineProps<{ entries: MiniCalendarEntry[]; emptyTitle?: string }>(), { emptyTitle: 'Aucune date prévue' });

const KINDS: Record<MiniCalendarKind, { label: string; icon: any; color: string }> = {
  cinema: { label: 'Au cinéma', icon: Clapperboard, color: 'var(--amber)' },
  streaming: { label: 'En streaming', icon: MonitorPlay, color: 'var(--accent)' },
  physical: { label: 'En physique', icon: Disc3, color: 'var(--violet, var(--blue))' },
  episode: { label: 'Épisode', icon: Tv, color: 'var(--green)' },
  other: { label: 'Date', icon: CalendarDays, color: 'var(--muted)' },
};

function relative(days: number): string {
  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Demain';
  if (days === -1) return 'Hier';
  if (days > 0) return days < 31 ? `Dans ${days} j` : '';
  return -days < 31 ? `Il y a ${-days} j` : '';
}

const sorted = computed(() => {
  const today = new Date();
  return props.entries
    .map((entry) => {
      const date = parseApiDate(entry.date);
      const days = differenceInCalendarDays(date, today);
      return {
        ...entry,
        time: date.getTime(),
        monthKey: format(date, 'yyyy-MM'),
        monthLabel: format(date, 'MMMM yyyy', { locale: fr }),
        day: format(date, 'd'),
        weekday: format(date, 'EEE', { locale: fr }),
        longDate: format(date, 'EEEE d MMMM yyyy', { locale: fr }),
        relative: relative(days),
        past: days < 0,
      };
    })
    .sort((a, b) => a.time - b.time);
});
const hasPast = computed(() => sorted.value.some((entry) => entry.past));
const firstUpcomingKey = computed(() => sorted.value.find((entry) => !entry.past)?.key || '');
const months = computed(() => {
  const groups = new Map<string, { key: string; label: string; entries: typeof sorted.value }>();
  for (const entry of sorted.value) {
    if (!groups.has(entry.monthKey)) groups.set(entry.monthKey, { key: entry.monthKey, label: entry.monthLabel, entries: [] });
    groups.get(entry.monthKey)!.entries.push(entry);
  }
  return [...groups.values()];
});
</script>

<style scoped lang="scss">
.mini-calendar__months, .mini-calendar__dates { display: grid; margin: 0; padding: 0; list-style: none; }
.mini-calendar__months { gap: var(--space-4); }
.mini-calendar__month { display: grid; gap: var(--space-2); }
.mini-calendar__month h3 { margin: 0; color: var(--muted); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.mini-calendar__dates { gap: 6px; }
.mini-date { display: flex; align-items: center; gap: var(--space-3); min-width: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-left: 3px solid var(--kind-color); border-radius: var(--radius-sm); background: var(--surface); }
.mini-date.is-past { opacity: .55; }
.mini-date__day { display: grid; flex: none; justify-items: center; width: 2.6rem; line-height: 1.1; }
.mini-date__day strong { font-family: var(--font-display); font-size: var(--fs-lg); }
.mini-date__day small { color: var(--muted); font-size: var(--fs-xs); text-transform: capitalize; }
.mini-date__icon { display: grid; flex: none; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: color-mix(in srgb, var(--kind-color) 16%, var(--surface)); color: var(--kind-color); }
.mini-date__icon svg { width: 16px; height: 16px; }
.mini-date__text { display: grid; flex: 1; gap: 1px; min-width: 0; }
.mini-date__text strong { overflow: hidden; font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.mini-date__text small { color: var(--muted); font-size: var(--fs-xs); }
.mini-date__when { flex: none; color: var(--kind-color); font-size: var(--fs-xs); font-weight: 700; white-space: nowrap; }
.mini-calendar__today { display: flex; align-items: center; gap: var(--space-2); color: var(--accent); font-size: var(--fs-xs); font-weight: 700; }
.mini-calendar__today::before, .mini-calendar__today::after { content: ''; flex: 1; height: 1px; background: color-mix(in srgb, var(--accent) 45%, transparent); }
</style>
