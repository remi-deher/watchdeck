<template>
  <AppPage title="Journaux" v-model:query="search" placeholder="Filtrer les journaux" has-filters :active-count="activeFilterCount" :filters-open="filtersOpen" @toggle-filters="toggleFilters">
    <div class="psh-layout">
      <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
        <FilterGroup label="Gravité">
          <UiChipGroup label="Gravité" :options="[{ value: '', label: 'Toutes les entrées' }, { value: 'problems', label: 'Alertes et erreurs' }, { value: 'errors', label: 'Erreurs seulement' }]" v-model="severity" />
        </FilterGroup>
        <FilterGroup v-if="tab === 'diagnostic'" label="Section">
          <UiChipGroup label="Section" :options="[{ value: '', label: 'Toutes les sections' }, { value: 'request', label: 'Demande' }, { value: 'arr', label: 'Arr' }, { value: 'plex', label: 'Plex' }, { value: 'vf_vo', label: 'VF / VO' }, { value: 'notification', label: 'Notification' }]" v-model="category" />
        </FilterGroup>
        <FilterGroup v-if="tab === 'app'" label="Niveau">
          <UiChipGroup label="Niveau" :options="[{ value: '', label: 'Tous les niveaux' }, ...['INFO', 'WARNING', 'ERROR', 'CRITICAL'].map((value) => ({ value, label: value }))]" v-model="level" />
        </FilterGroup>
        <FilterGroup v-if="tab === 'polls'" label="Tâche">
          <UiCombobox label="Tâche planifiée" placeholder="Toutes les tâches" :options="jobs.map((name) => ({ value: name, label: name }))" v-model="job" />
        </FilterGroup>
      </FilterSidebar>
      <div class="psh-main">
        <AppSubnav variant="tabs" :active="tab" :items="tabItems" aria-label="Type de journal" @update:active="selectTab" />
        <div class="log-toolbar">
          <span class="log-count" aria-live="polite">{{ filtered.length }} entrée{{ filtered.length > 1 ? 's' : '' }}</span>
          <UiButton size="sm" :variant="live ? 'primary' : 'secondary'" :aria-pressed="live" @click="live = !live">
            <template #icon><Radio /></template>{{ live ? 'Suivi en direct' : 'Suivre en direct' }}
          </UiButton>
        </div>
        <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
        <section class="panel log-panel" aria-label="Journal">
          <UiFeedback v-if="loading && !shown.length" type="loading" message="Chargement des journaux…" />
          <UiEmptyState v-else-if="!shown.length" message="Aucune entrée pour ce filtre." />
          <ul v-else class="log-list">
            <li v-for="row in shown" :key="keyOf(row)" class="log-row" :class="`is-${badgeTone(row)}`">
              <time class="log-time" :datetime="isoOf(row)">{{ dateOf(row) }}</time>
              <div class="log-body">
                <strong>{{ titleOf(row) }}</strong>
                <small class="table-detail">{{ detailOf(row) ? `${typeOf(row)} · ${detailOf(row)}` : typeOf(row) }}</small>
                <!-- Le contexte technique reste replié : un objet JSON peut être long et ne doit
                     jamais pousser la description utile hors de vue. -->
                <CollapsibleRoot v-if="payloadOf(row)" class="log-payload" :unmount-on-hide="false"><CollapsibleTrigger class="collapsible-trigger">Détail technique</CollapsibleTrigger><CollapsibleContent class="collapsible-content"><pre>{{ payloadOf(row) }}</pre></CollapsibleContent></CollapsibleRoot>
              </div>
              <UiBadge :tone="badgeTone(row)">{{ resultOf(row) }}</UiBadge>
            </li>
          </ul>
          <LoadMore
            :has-more="shown.length < filtered.length"
            :label="`Afficher plus d'entrées (${shown.length} sur ${filtered.length})`"
            @load="visibleCount += PAGE_SIZE"
          />
        </section>
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->
  </AppPage>
</template>

<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiCombobox from '@/components/ui/UiCombobox.vue';
import { formatDateTimeSeconds, parseApiDate } from '@/utils/format';
import { computed, ref, watch } from 'vue';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { Radio } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import LoadMore from '@/components/ui/LoadMore.vue';

import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiBadge from '@/components/ui/UiBadge.vue';

const tab = ref('diagnostic');
const search = ref(''), level = ref(''), category = ref(''), job = ref(''), severity = ref('');
// Suivi en direct : relit le journal toutes les cinq secondes tant que le bouton est actif.
const live = ref(false);
// Seul l'onglet diagnostic filtre cote serveur sur la recherche : la frappe est lissee
// pour ne pas relancer une requete a chaque caractere.
const serverSearch = refDebounced(search, 300);
const queryClient = useQueryClient();
const logsQuery = useQuery({
  queryKey: computed(() => ['logs', tab.value, {
    category: tab.value === 'diagnostic' ? category.value : '',
    search: tab.value === 'diagnostic' ? serverSearch.value : '',
    job: tab.value === 'polls' ? job.value : '',
  }]),
  queryFn: ({ signal }) => api<any>(endpoint(), { signal }),
  select: (data: any): any[] => (Array.isArray(data) ? data : (data?.items || [])),
  // Garder les lignes du filtre precedent pendant le chargement du suivant evite de
  // vider le tableau, mais pas d'un onglet a l'autre : les colonnes n'ont pas le meme sens.
  placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === tab.value ? keepPreviousData(previous) : undefined),
  staleTime: 10_000,
  refetchInterval: () => (live.value ? 5_000 : false),
});
const rows = computed<any[]>(() => logsQuery.data.value || []);
const loading = computed(() => logsQuery.isFetching.value);
const error = computed(() => (logsQuery.error.value ? humanizeError(logsQuery.error.value) : ''));
const tabs = [{ id: 'diagnostic', label: 'Demandes' }, { id: 'app', label: 'Application' }, { id: 'polls', label: 'Tâches' }, { id: 'audit', label: 'Audit admin' }];
const tabItems = tabs.map((item) => ({ key: item.id, label: item.label }));
function selectTab(value: string): void { tab.value = value; }
const jobs = computed(() => [...new Set(rows.value.map((x) => x.job).filter(Boolean))]);
const filtered = computed(() => rows.value.filter((row) => (!level.value || row.level === level.value) && matchesSeverity(row) && (!search.value || JSON.stringify(row).toLowerCase().includes(search.value.toLowerCase()))));
const { filtersOpen, activeCount: activeFilterCount, toggle: toggleFilters, close: closeFilters, reset: resetFiltersDrawer } = useFiltersDrawer(
  { search, level, category, job, severity },
  { search: '', level: '', category: '', job: '', severity: '' },
  { memoriser: 'journaux' }
);
const PAGE_SIZE = 50;
const visibleCount = ref(PAGE_SIZE);
/* Les entrées se lisent de la plus récente à la plus ancienne, avant l'affichage par tranches. */
function timeOf(r: any): number { const v = r.created_at || r.time || r.started_at; return v ? parseApiDate(String(v)).getTime() || 0 : 0; }
const sorted = computed(() => [...filtered.value].sort((a, b) => timeOf(b) - timeOf(a)));
const shown = computed(() => sorted.value.slice(0, visibleCount.value));
watch(filtered, () => { visibleCount.value = PAGE_SIZE; });
function resetFilters(): void { resetFiltersDrawer(); }

function endpoint(): string {
  if (tab.value === 'diagnostic') return `/api/diagnostic-logs?limit=300${category.value ? `&category=${encodeURIComponent(category.value)}` : ''}${serverSearch.value ? `&search=${encodeURIComponent(serverSearch.value)}` : ''}`;
  if (tab.value === 'polls') return `/api/poll-history?limit=200${job.value ? `&job=${encodeURIComponent(job.value)}` : ''}`;
  if (tab.value === 'audit') return '/api/admin-action-logs?limit=200';
  return '/api/logs';
}
function load(): void { void logsQuery.refetch(); }
function invalidateLogs(): Promise<void> { return queryClient.invalidateQueries({ queryKey: ['logs'] }); }
function isoOf(r: any): string | undefined { const v = r.created_at || r.time || r.started_at; return v ? String(v).replace(' ', 'T') : undefined; }
function keyOf(r: any): string { return `${tab.value}-${r.id || r.time || r.created_at}-${r.message || r.action || r.job}`; }
function dateOf(r: any): string { const v = r.created_at || r.time || r.started_at; return formatDateTimeSeconds(v && (v.replace?.(' ', 'T') || v)); }
function typeOf(r: any): string { if (tab.value === 'diagnostic') return ({ request: 'Demande', arr: 'Arr', plex: 'Plex', vf_vo: 'VF / VO', notification: 'Notification' } as Record<string, string>)[r.category] || r.category || '-'; return r.level || r.job || r.action || r.event_label || r.event || '-'; }
/* « Demande #– » s'affichait sur toute ligne sans titre ni identifiant : le gabarit
   presumait que chaque evenement appartenait a une demande, ce qui n'est pas le cas.
   On ne nomme donc une demande que lorsqu'il y en a vraiment une. */
function titleOf(r: any): string {
  if (tab.value === 'diagnostic') return r.title || (r.request_id ? `Demande #${r.request_id}` : (r.action || r.message || 'Évènement'));
  return r.message || r.summary || r.media_title || (r.req_id ? `Demande #${r.req_id}` : 'Évènement');
}

/* Contexte technique brut, rendu dans un depliant plutot que colle a la description. */
function payloadOf(r: any): string {
  if (tab.value !== 'diagnostic' || !r.details) return '';
  try { return JSON.stringify(r.details, null, 2); } catch { return String(r.details); }
}
function detailOf(r: any): string { if (tab.value === 'diagnostic') return [r.action, r.message].filter(Boolean).join(' — '); if (tab.value === 'app') return r.logger || ''; if (tab.value === 'polls') return r.error_detail || `${r.items_processed || 0} élément(s) traité(s)`; return r.actor_name || ''; }
/* Les statuts arrivent tels quels de la base (`success`, `error`, `skipped`…) et
   s'affichaient en anglais, en capitales, dans une interface entierement francaise. */
const STATUS_LABELS: Record<string, string> = {
  success: 'Succès',
  ok: 'Succès',
  error: 'Échec',
  failed: 'Échec',
  warning: 'Avertissement',
  pending: 'En attente',
  skipped: 'Ignoré',
  ignored: 'Ignoré',
  started: 'Démarré',
  info: 'Information',
};
function resultOf(r: any): string { if (tab.value === 'diagnostic') { const raw = String(r.status || '').toLowerCase(); return STATUS_LABELS[raw] || r.status || '—'; } if (tab.value === 'polls') return r.errors ? `${r.errors} erreur(s)` : `${r.duration_ms || 0} ms`; if (tab.value === 'audit') return `${r.target_count || 0} cible(s)`; return r.level || (r.valid === false ? 'Invalide' : 'Information'); }
function badgeTone(r: any): string { if (r.status === 'error' || r.level === 'ERROR' || r.level === 'CRITICAL' || r.errors || r.valid === false) return 'danger'; if (r.status === 'warning' || r.status === 'ignored' || r.level === 'WARNING') return 'warning'; return 'success'; }
function matchesSeverity(r: any): boolean {
  const tone = badgeTone(r);
  if (severity.value === 'errors') return tone === 'danger';
  if (severity.value === 'problems') return tone === 'danger' || tone === 'warning';
  return true;
}
useRealtime(['request.updated', 'job.updated', 'notification.updated'], () => { void invalidateLogs(); });
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.log-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin: var(--space-3) 0; }
.log-count { color: var(--muted); font-size: var(--fs-sm); }
.log-panel { padding: 0; overflow: hidden; }
.log-list { margin: 0; padding: 0; list-style: none; }
.log-row {
  display: grid;
  grid-template-columns: 9.5rem minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: start;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  border-left: 3px solid transparent;
}
.log-row:last-child { border-bottom: 0; }
.log-row.is-danger { border-left-color: var(--red); }
.log-row.is-warning { border-left-color: var(--amber); }
.log-time { color: var(--muted); font-family: var(--font-mono, monospace); font-size: var(--fs-xs); }
.log-body { display: grid; gap: 2px; min-width: 0; }
.log-body strong, .log-body small { overflow-wrap: anywhere; }
.log-body small { color: var(--muted); }
@include bp.until(tablet) {
  .log-row { grid-template-columns: minmax(0, 1fr) auto; }
  .log-time { grid-column: 1 / -1; }
}
/* Depliant de contexte technique : discret quand il est ferme, delimite et defilable
   quand il est ouvert -- un objet JSON peut etre long et ne doit jamais elargir la
   colonne. */
.log-payload {
  margin-top: var(--space-1);
}
.log-payload .collapsible-trigger {
  color: var(--muted);
  font-size: var(--fs-xs);
  cursor: pointer;
}
.log-payload .collapsible-trigger:hover { color: var(--text); }
.log-payload pre {
  margin: var(--space-1) 0 0;
  max-height: 260px;
  padding: var(--space-2);
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  white-space: pre;
}
</style>
