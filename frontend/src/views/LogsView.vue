<template>
    <AppPage title="Journaux" v-model:query="search" placeholder="Filtrer les journaux" has-filters :active-count="activeFilterCount" :filters-open="filtersOpen" @toggle-filters="toggleFilters">
    
    <div class="psh-layout">
      <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
        <FilterGroup v-if="tab === 'diagnostic'" label="Section">
          <UiChipGroup label="Section" :options="[{ value: '', label: 'Toutes les sections' }, { value: 'request', label: 'Demande' }, { value: 'arr', label: 'Arr' }, { value: 'plex', label: 'Plex' }, { value: 'vf_vo', label: 'VF / VO' }, { value: 'notification', label: 'Notification' }]" v-model="category" />
        </FilterGroup>
        <FilterGroup v-if="tab === 'app'" label="Niveau">
          <UiChipGroup label="Niveau" :options="[{ value: '', label: 'Tous les niveaux' }, ...['INFO', 'WARNING', 'ERROR', 'CRITICAL'].map((value) => ({ value, label: value }))]" v-model="level" />
        </FilterGroup>
        <FilterGroup v-if="tab === 'polls'" label="Tâche">
          <UiCombobox label="Tâche planifiée" placeholder="Toutes les tâches" :options="jobs.map((name) => ({ value: name, label: name }))" v-model="job" />
        </FilterGroup>
        <UiButton v-if="tab === 'pending' && rows.length" variant="danger" @click="purge"><Trash2 />Purger la file</UiButton>
      </FilterSidebar>
      <div class="psh-main">
    <AppSubnav variant="tabs" :active="tab" :items="tabItems" aria-label="Type de journal" @update:active="selectTab" />
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
    <UiDataTable class="panel" label="Tableau des journaux" :rows="shown" :columns="LOG_COLUMNS" :row-key="keyOf" manual-sort :sort="sort" @update:sort="setSort">
      <template #empty>
        <UiFeedback v-if="loading" type="loading" message="Chargement des journaux…"/>
        <UiEmptyState v-else message="Aucune entrée pour ce filtre." />
      </template>
      <template #cell-date="{ row }">{{ dateOf(row) }}</template>
      <template #cell-section="{ row }"><UiBadge :tone="badgeTone(row)">{{ typeOf(row) }}</UiBadge></template>
      <template #cell-description="{ row }">
        <strong>{{ titleOf(row) }}</strong><small class="table-detail">{{ detailOf(row) }}</small>
        <!-- Le contexte technique etait serialise en JSON a meme la colonne : illisible, et
             il poussait la description utile hors de vue. Il se deplie a la demande. -->
        <CollapsibleRoot v-if="payloadOf(row)" class="log-payload" :unmount-on-hide="false"><CollapsibleTrigger class="collapsible-trigger">Détail technique</CollapsibleTrigger><CollapsibleContent class="collapsible-content"><pre>{{ payloadOf(row) }}</pre></CollapsibleContent></CollapsibleRoot>
      </template>
      <template #cell-result="{ row }">{{ resultOf(row) }}</template>
      <template #after>
        <LoadMore
          :has-more="shown.length < filtered.length"
          :label="`Afficher plus d'entrées (${shown.length} sur ${filtered.length})`"
          @load="visibleCount += PAGE_SIZE"
        />
      </template>
    </UiDataTable>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
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
import { Trash2 } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import ConfirmModal from '@/components/ConfirmModal.vue';
import LoadMore from '@/components/ui/LoadMore.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';

const LOG_COLUMNS: UiColumn[] = [
  { key: 'date', label: 'Date', sortable: true },
  { key: 'section', label: 'Section', sortable: true },
  { key: 'description', label: 'Description', card: 'title', sortable: true },
  { key: 'result', label: 'Résultat', sortable: true },
];
import { useConfirmedAction } from '@/composables/useConfirmedAction';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiBadge from '@/components/ui/UiBadge.vue';

const tab = ref('diagnostic');
const search = ref(''), level = ref(''), category = ref(''), job = ref('');
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
});
const rows = computed<any[]>(() => logsQuery.data.value || []);
const loading = computed(() => logsQuery.isFetching.value);
// L'erreur des actions confirmees (purge) reste distincte de celle de la lecture.
const actionError = ref('');
const error = computed(() => actionError.value || (logsQuery.error.value ? humanizeError(logsQuery.error.value) : ''));
const { dialog: confirmDialog, resolveConfirm, runConfirmed } = useConfirmedAction({ error: actionError });
const tabs = [{ id: 'diagnostic', label: 'Parcours demandes' }, { id: 'app', label: 'Application' }, { id: 'polls', label: 'Tâches planifiées' }, { id: 'audit', label: 'Audit admin' }, { id: 'pending', label: 'File notifications' }];
const tabItems = tabs.map((item) => ({ key: item.id, label: item.label }));
function selectTab(value: string): void { tab.value = value; }
const jobs = computed(() => [...new Set(rows.value.map((x) => x.job).filter(Boolean))]);
const filtered = computed(() => rows.value.filter((row) => (!level.value || row.level === level.value) && (!search.value || JSON.stringify(row).toLowerCase().includes(search.value.toLowerCase()))));
const { filtersOpen, activeCount: activeFilterCount, toggle: toggleFilters, close: closeFilters, reset: resetFiltersDrawer } = useFiltersDrawer(
  { search, level, category, job },
  { search: '', level: '', category: '', job: '' },
  { memoriser: 'journaux' }
);
const PAGE_SIZE = 50;
const visibleCount = ref(PAGE_SIZE);
/* Le tri porte sur toutes les entrees filtrees, AVANT l'affichage par tranches : trier
   le tableau lui-meme n'aurait range que les cinquante lignes visibles. */
const sort = ref<{ key: string; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
function setSort(value: { key: string; direction: 'asc' | 'desc' } | null): void {
  sort.value = value || { key: 'date', direction: 'desc' };
}
// Les niveaux se rangent par gravite, pas par ordre alphabetique.
const LEVEL_RANK: Record<string, number> = { CRITICAL: 4, ERROR: 3, WARNING: 2, INFO: 1, DEBUG: 0 };
function sortValueOf(r: any, key: string): string | number {
  if (key === 'date') { const v = r.created_at || r.time || r.started_at; return v ? parseApiDate(String(v)).getTime() || 0 : 0; }
  if (key === 'section') return r.level ? (LEVEL_RANK[String(r.level).toUpperCase()] ?? -1) : typeOf(r).toLocaleLowerCase('fr');
  if (key === 'description') return titleOf(r).toLocaleLowerCase('fr');
  if (tab.value === 'polls') return (Number(r.errors) || 0) * 1e9 + (Number(r.duration_ms) || 0);
  return resultOf(r).toLocaleLowerCase('fr');
}
const sorted = computed(() => {
  const { key, direction } = sort.value;
  const sign = direction === 'asc' ? 1 : -1;
  return [...filtered.value].sort((a, b) => {
    const x = sortValueOf(a, key), y = sortValueOf(b, key);
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr')) * sign;
  });
});
const shown = computed(() => sorted.value.slice(0, visibleCount.value));
watch(filtered, () => { visibleCount.value = PAGE_SIZE; });
function resetFilters(): void { resetFiltersDrawer(); }

function endpoint(): string {
  if (tab.value === 'diagnostic') return `/api/diagnostic-logs?limit=300${category.value ? `&category=${encodeURIComponent(category.value)}` : ''}${serverSearch.value ? `&search=${encodeURIComponent(serverSearch.value)}` : ''}`;
  if (tab.value === 'polls') return `/api/poll-history?limit=200${job.value ? `&job=${encodeURIComponent(job.value)}` : ''}`;
  if (tab.value === 'audit') return '/api/admin-action-logs?limit=200';
  if (tab.value === 'pending') return '/api/notifications/pending';
  return '/api/logs';
}
function load(): void { actionError.value = ''; void logsQuery.refetch(); }
function invalidateLogs(): Promise<void> { return queryClient.invalidateQueries({ queryKey: ['logs'] }); }
async function purge(): Promise<void> {
  await runConfirmed(async () => {
    await api('/api/notifications/pending/purge', { method: 'POST', body: JSON.stringify({ ids: [], mark_handled: false }) });
    await invalidateLogs();
  }, {
    title: 'Purger la file de notifications ?',
    message: 'Toutes les notifications en attente seront supprimées définitivement.',
    confirmLabel: 'Purger la file',
    danger: true,
  }, { reload: false });
}
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
function detailOf(r: any): string { if (tab.value === 'diagnostic') return [r.action, r.message].filter(Boolean).join(' — '); if (tab.value === 'app') return r.logger || ''; if (tab.value === 'polls') return r.error_detail || `${r.items_processed || 0} élément(s) traité(s)`; if (tab.value === 'audit') return r.actor_name || ''; return (r.recipients || []).join(', '); }
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
function resultOf(r: any): string { if (tab.value === 'diagnostic') { const raw = String(r.status || '').toLowerCase(); return STATUS_LABELS[raw] || r.status || '—'; } if (tab.value === 'polls') return r.errors ? `${r.errors} erreur(s)` : `${r.duration_ms || 0} ms`; if (tab.value === 'audit') return `${r.target_count || 0} cible(s)`; return r.valid ? 'Valide' : 'Invalide'; }
function badgeTone(r: any): string { if (r.status === 'error' || r.level === 'ERROR' || r.level === 'CRITICAL' || r.errors || r.valid === false) return 'danger'; if (r.status === 'warning' || r.status === 'ignored' || r.level === 'WARNING') return 'warning'; return 'success'; }
useRealtime(['request.updated', 'job.updated', 'notification.updated'], () => { void invalidateLogs(); });
</script>

<style scoped lang="scss">
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
