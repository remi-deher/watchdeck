import { computed, ref } from 'vue';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { addDays, addMonths, startOfMonth } from 'date-fns';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { useRealtimeQuery } from '@/composables/useRealtimeQuery';
import { useSession } from '@/composables/useSession';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { chipsFromGroups, type FilterGroupDefinition } from '@/composables/useFiltersDrawer';
import { mediaDetailPath, openPlexLink } from '@/mediaUrl';
import { formatMonthYear } from '@/utils/format';
import { localIso } from '@/utils/timeBuckets';
import { STATE_LABELS, STATE_ORDER, eventSourceGroups, eventState, releaseIcon, sourceGroupLabel, type CalendarEvent, type CalendarState } from '@/utils/calendarEvents';
import { periodBounds, type PlanEvent, type PlanState, type PlanView } from '@/components/templates/plan/types';

const STATE_COLORS: Record<CalendarState, string> = {
  available: 'var(--success)', downloading: 'var(--blue)', late: 'var(--danger)', released: 'var(--muted)', upcoming: 'var(--accent)',
};
const VF_OPTIONS = [
  { value: '', label: 'Toutes' }, { value: 'vf', label: 'VF' }, { value: 'vo', label: 'VO' },
  { value: 'unchecked', label: 'Non analysée' }, { value: 'requested', label: 'Pas encore dans Plex' },
];
/* La recherche porte sur une large fenetre, pas sur le seul mois affiche : chercher un titre sans
   savoir quand il sort etait le cas le plus courant. */
const SEARCH_MONTHS_BEFORE = 3, SEARCH_MONTHS_AFTER = 12;

/**
 * Donnees de la page Calendrier (gabarit Anticiper) : sorties de la periode, filtres, recherche,
 * ouverture d'une fiche. Le gabarit fait la grille, la navigation et la legende.
 */
export function useCalendar() {
  const router = useRouter();
  const route = useRoute();
  const { session, isAdmin, ready: sessionReady } = useSession();

  const search = ref(''), type = ref(''), state = ref(''), vf = ref(''), source = ref(''), requester = ref(''), tracked = ref('');
  const cursor = ref(new Date());
  const initialView = (typeof localStorage !== 'undefined' && (localStorage.getItem('calendar.view') as PlanView)) || 'month';
  const view = ref<PlanView>(initialView === 'week' || initialView === 'agenda' ? initialView : 'month');
  const searching = computed(() => search.value.trim().length >= 2);
  const searchBounds = (() => {
    const start = startOfMonth(addMonths(new Date(), -SEARCH_MONTHS_BEFORE));
    return { start, end: addMonths(start, SEARCH_MONTHS_BEFORE + SEARCH_MONTHS_AFTER + 1) };
  })();
  const searchScope = `${formatMonthYear(searchBounds.start)} à ${formatMonthYear(addDays(searchBounds.end, -1))}`;
  const bounds = computed(() => (searching.value ? searchBounds : periodBounds(view.value, cursor.value)));

  /* Tout ce qui determine les sorties (periode, « suivis uniquement », demandeur) entre dans la cle :
     changer de periode relance seul, revenir sur une periode vue la repeint aussitot. */
  const calendarUrl = computed(() => {
    const user = isAdmin.value ? requester.value : session.value?.plex_user_id;
    return `/api/calendar?start=${localIso(bounds.value.start)}&end=${localIso(bounds.value.end)}&tracked_only=${tracked.value === 'tracked'}${user ? `&user=${encodeURIComponent(user)}` : ''}`;
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
  const raw = computed<CalendarEvent[]>(() => calendarQuery.data.value || []);
  const loading = computed(() => calendarQuery.isFetching.value);
  const error = computed(() => (calendarQuery.error.value as Error | null)?.message || '');
  const reload = () => { void calendarQuery.refetch(); };
  // Un evenement met a jour chaque occurrence du media dans le cache ; faute de correspondance, la periode est relue.
  useRealtimeQuery<any[]>(calendarKey, ['request.updated', 'download.updated'], {
    keyFields: ['request_id', 'id', 'tvdb_id', 'tmdb_id'],
    patchAll: true,
    mapper: (payload: any) => {
      const data = { ...payload };
      if (payload.status === 'available' || payload.has_file !== undefined) data.has_file = payload.has_file ?? (payload.status === 'available');
      return data;
    },
  });

  // Repere des etats « en retard » : fige au chargement de la page.
  const now = Date.now();
  const keyOf = (event: any) => `${event.instance}:${event.date}:${event.title}:${event.subtitle}`;
  const stateOf = (event: CalendarEvent): CalendarState => eventState(event, now);
  const needle = computed(() => search.value.trim().toLowerCase());
  const filtered = computed(() => raw.value.filter((event) => (!searching.value || event.title.toLowerCase().includes(needle.value) || (event.subtitle || '').toLowerCase().includes(needle.value))
    && (!type.value || event.type === type.value)
    && (!vf.value || (event as any).vf_state === vf.value)
    && (!source.value || eventSourceGroups(event).includes(source.value))
    && (!state.value || stateOf(event) === state.value)));
  const events = computed<PlanEvent[]>(() => filtered.value.map((event: any) => ({
    ...event,
    key: keyOf(event),
    state: stateOf(event),
    poster: event.poster_url,
    icon: releaseIcon(event),
  })));
  const states: PlanState[] = STATE_ORDER.map((key) => ({ key, label: STATE_LABELS[key], color: STATE_COLORS[key], emphasize: key !== 'upcoming' }));

  // Filtres : des definitions (donnees), rendues par les composants communs.
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
  const sourceOptions = computed(() => {
    const groups = new Set<string>();
    raw.value.forEach((event) => eventSourceGroups(event).forEach((group) => groups.add(group)));
    if (source.value) groups.add(source.value);
    return [{ value: '', label: 'Toutes' }, ...[...groups].sort().map((group) => ({ value: group, label: sourceGroupLabel(group) }))];
  });
  const filterGroups = computed<FilterGroupDefinition[]>(() => [
    { key: 'type', label: 'Type de média', options: [{ value: '', label: 'Films et séries' }, { value: 'movie', label: 'Films' }, { value: 'episode', label: 'Séries' }], value: type.value, fallback: '', set: (value) => { type.value = value; } },
    { key: 'state', label: 'État', options: [{ value: '', label: 'Tous' }, ...STATE_ORDER.map((key) => ({ value: key, label: STATE_LABELS[key] }))], value: state.value, fallback: '', set: (value) => { state.value = value; } },
    { key: 'vf', label: 'Version', options: VF_OPTIONS, value: vf.value, fallback: '', set: (value) => { vf.value = value; } },
    ...(sourceOptions.value.length > 2 ? [{ key: 'source', label: 'Origine', options: sourceOptions.value, value: source.value, fallback: '', set: (value: string) => { source.value = value; } }] : []),
    ...(requesterOptions.value.length > 2 ? [{ key: 'requester', label: 'Demandeur', options: requesterOptions.value, value: requester.value, fallback: '', set: (value: string) => { requester.value = value; } }] : []),
    { key: 'tracked', label: 'Suivi', options: [{ value: '', label: 'Tout' }, { value: 'tracked', label: 'Suivis uniquement' }], value: tracked.value, fallback: '', set: (value) => { tracked.value = value; } },
  ]);
  const chips = computed(() => chipsFromGroups(filterGroups.value));
  function resetFilters(): void { type.value = ''; state.value = ''; vf.value = ''; source.value = ''; requester.value = ''; tracked.value = ''; search.value = ''; }

  function openDetail(event: any): void {
    if (event.library_item_id) ouvrirFiche(router, mediaDetailPath({ id: event.library_item_id }, 'library'), route.fullPath);
    else if (event.request_id) ouvrirFiche(router, mediaDetailPath({ id: event.request_id }, 'request'), route.fullPath);
  }
  function openPlex(event: any, domEvent?: Event): void {
    if (domEvent) { domEvent.stopPropagation(); domEvent.preventDefault(); }
    if (event.plex_guid) openPlexLink(event.plex_guid);
    else openDetail(event);
  }

  return {
    search, cursor, view, searching, searchScope, events, states, loading, error, reload, now,
    filterGroups, chips, resetFilters, openDetail, openPlex,
  };
}
