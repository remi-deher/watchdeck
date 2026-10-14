import { computed, ref, watch } from 'vue';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { useRoute } from 'vue-router';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { humanizeError } from '@/utils/apiError';
import { chipsFromGroups, type FilterGroupDefinition } from '@/composables/useFiltersDrawer';
import { logsToCsv } from '@/views/logsCsv';
import { LOG_TYPES, dateOf, detailOf, outcomeOf, resultOf, timeOf, titleOf, toDetail, toEvent, typeOf, keyOf, type LogType } from '@/logs/logRows';
import type { UnderstandEvent } from '@/components/templates/UnderstandTemplate.vue';
import type { SubnavItem } from '@/components/ui/AppSubnav.vue';

const PAGE_SIZE = 50;

interface LogsSummary { total: number; errors: { diagnostic: number; app: number; polls: number; notifications: number } }
const SOURCE_LABELS: Record<string, string> = { diagnostic: 'demandes', app: 'application', polls: 'tâches', notifications: 'envois de notification' };

/**
 * Donnees de la page Journaux (gabarit Comprendre) : les quatre journaux, leurs filtres, le
 * bilan des dernieres 24 h et l'export. Le type de journal est dans l'adresse (`?type=`).
 */
export function useLogs() {
  const route = useRoute();
  const queryClient = useQueryClient();

  const type = computed<LogType>(() => {
    const asked = String(route.query.type || '');
    return (LOG_TYPES.find((entry) => entry.key === asked)?.key ?? 'diagnostic') as LogType;
  });
  const tabs = computed<SubnavItem[]>(() => LOG_TYPES.map((entry) => ({ key: entry.key, label: entry.label, to: { path: route.path, query: { ...route.query, type: entry.key } } })));

  const search = ref(''), level = ref(''), category = ref(''), job = ref(''), severity = ref('');
  // Suivi en direct : relit le journal toutes les cinq secondes tant qu'il est actif.
  const live = ref(false);
  // Seul le journal des demandes filtre cote serveur sur la recherche : la frappe est lissee.
  const serverSearch = refDebounced(search, 300);

  function endpoint(): string {
    if (type.value === 'diagnostic') return `/api/diagnostic-logs?limit=300${category.value ? `&category=${encodeURIComponent(category.value)}` : ''}${serverSearch.value ? `&search=${encodeURIComponent(serverSearch.value)}` : ''}`;
    if (type.value === 'polls') return `/api/poll-history?limit=200${job.value ? `&job=${encodeURIComponent(job.value)}` : ''}`;
    if (type.value === 'audit') return '/api/admin-action-logs?limit=200';
    return '/api/logs';
  }
  const logsQuery = useQuery({
    queryKey: computed(() => ['logs', type.value, {
      category: type.value === 'diagnostic' ? category.value : '',
      search: type.value === 'diagnostic' ? serverSearch.value : '',
      job: type.value === 'polls' ? job.value : '',
    }]),
    queryFn: ({ signal }) => api<any>(endpoint(), { signal }),
    select: (data: any): any[] => (Array.isArray(data) ? data : (data?.items || [])),
    // Garder les lignes du filtre precedent pendant le chargement du suivant, pas d'un journal a l'autre.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === type.value ? keepPreviousData(previous) : undefined),
    staleTime: 10_000,
    refetchInterval: () => (live.value ? 5_000 : false),
  });
  const rows = computed<any[]>(() => logsQuery.data.value || []);
  const loading = computed(() => logsQuery.isFetching.value);
  const error = computed(() => (logsQuery.error.value ? humanizeError(logsQuery.error.value) : ''));
  const reload = () => { void logsQuery.refetch(); };
  useRealtime(['request.updated', 'job.updated', 'notification.updated'], () => { void queryClient.invalidateQueries({ queryKey: ['logs'] }); });

  const SEVERITIES = [
    { value: '', label: 'Toutes les entrées' },
    { value: 'problems', label: 'Alertes et erreurs' },
    { value: 'errors', label: 'Erreurs seulement' },
  ];
  const filtered = computed(() => rows.value
    .filter((row) => (!level.value || row.level === level.value)
      && (severity.value === 'errors' ? outcomeOf(type.value, row) === 'failed'
        : severity.value === 'problems' ? ['failed', 'warning'].includes(outcomeOf(type.value, row)) : true)
      && (!search.value || JSON.stringify(row).toLowerCase().includes(search.value.toLowerCase())))
    .sort((a, b) => timeOf(b) - timeOf(a)));
  const visibleCount = ref(PAGE_SIZE);
  watch([filtered, type], () => { visibleCount.value = PAGE_SIZE; });
  const shown = computed(() => filtered.value.slice(0, visibleCount.value));
  const events = computed<UnderstandEvent[]>(() => shown.value.map((row) => toEvent(type.value, row)));
  const hasMore = computed(() => shown.value.length < filtered.value.length);
  const loadMore = () => { visibleCount.value += PAGE_SIZE; };

  const jobs = computed(() => [...new Set(rows.value.map((row) => row.job).filter(Boolean))] as string[]);
  const filterGroups = computed<FilterGroupDefinition[]>(() => [
    ...(type.value === 'diagnostic' ? [{ key: 'category', label: 'Section', options: [{ value: '', label: 'Toutes les sections' }, { value: 'request', label: 'Demande' }, { value: 'arr', label: 'Arr' }, { value: 'plex', label: 'Plex' }, { value: 'vf_vo', label: 'VF / VO' }, { value: 'notification', label: 'Notification' }], value: category.value, fallback: '', set: (value: string) => { category.value = value; } }] : []),
    ...(type.value === 'app' ? [{ key: 'level', label: 'Niveau', options: [{ value: '', label: 'Tous les niveaux' }, ...['INFO', 'WARNING', 'ERROR', 'CRITICAL'].map((value) => ({ value, label: value }))], value: level.value, fallback: '', set: (value: string) => { level.value = value; } }] : []),
    ...(type.value === 'polls' ? [{ key: 'job', label: 'Tâche', options: [{ value: '', label: 'Toutes les tâches' }, ...jobs.value.map((name) => ({ value: name, label: name }))], value: job.value, fallback: '', set: (value: string) => { job.value = value; } }] : []),
  ]);
  const chips = computed(() => chipsFromGroups(filterGroups.value));
  function resetFilters(): void { level.value = ''; category.value = ''; job.value = ''; severity.value = ''; search.value = ''; }
  // Un filtre propre a un journal ne suit pas dans un autre.
  watch(type, () => { level.value = ''; category.value = ''; job.value = ''; });

  // Detail d'une entree, dans la feuille du gabarit.
  const openKey = ref('');
  const detail = computed(() => {
    const row = openKey.value ? filtered.value.find((entry) => keyOf(type.value, entry) === openKey.value) : null;
    return row ? toDetail(type.value, row) : null;
  });
  const open = (event: UnderstandEvent) => { openKey.value = openKey.value === event.key ? '' : event.key; };
  const close = () => { openKey.value = ''; };
  watch(type, close);

  // Bilan des dernieres 24 h, toutes sources confondues (les envois de notification y comptent).
  const summaryQuery = useQuery({ queryKey: ['logs', 'summary'], queryFn: () => api<LogsSummary>('/api/logs/summary'), staleTime: 30_000 });
  // Une reponse incomplete (serveur ancien, proxy) ne doit jamais faire tomber la page : pas de bilan.
  const totals = computed(() => {
    const data = summaryQuery.data.value;
    return data && data.errors && typeof data.total === 'number' ? data : null;
  });
  const summary = computed(() => {
    const data = totals.value;
    if (!data) return [];
    if (!data.total) return [{ key: 'none', label: 'erreur sur les dernières 24 h', value: 'Aucune', tone: 'success' as const }];
    return (Object.keys(SOURCE_LABELS) as Array<keyof LogsSummary['errors']>)
      .filter((key) => data.errors[key])
      .map((key) => ({ key, label: `erreur${data.errors[key] > 1 ? 's' : ''} · ${SOURCE_LABELS[key]} (24 h)`, value: String(data.errors[key]), tone: 'danger' as const }));
  });
  const notificationErrors = computed(() => totals.value?.errors.notifications || 0);

  function exportCsv(): void {
    const csv = logsToCsv(filtered.value.map((row) => ({ date: dateOf(row), source: typeOf(type.value, row), title: titleOf(type.value, row), detail: detailOf(type.value, row), result: resultOf(type.value, row) })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `watchdeck-journaux-${type.value}.csv` });
    link.click();
    URL.revokeObjectURL(url);
  }

  return {
    type, tabs, search, severity, severities: SEVERITIES, live,
    events, total: computed(() => filtered.value.length), count: computed(() => rows.value.length), hasMore, loadMore, loading, error, reload,
    filterGroups, chips, resetFilters, detail, openKey, open, close, summary, notificationErrors, exportCsv,
  };
}
