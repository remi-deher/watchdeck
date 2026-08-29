<template>
  <div class="page">
    <PageSearchHeader title="Journaux" description="Diagnostic applicatif, parcours des demandes et tâches planifiées." eyebrow="Administration" v-model:query="search" placeholder="Filtrer les journaux" has-filters :active-count="activeFilterCount" :filters-open="filtersOpen" @toggle-filters="toggleFilters" />
    <div class="psh-layout">
      <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
        <select v-if="tab === 'diagnostic'" v-model="category" @change="load"><option value="">Toutes les sections</option><option value="request">Demande</option><option value="arr">Arr</option><option value="plex">Plex</option><option value="vf_vo">VF / VO</option><option value="notification">Notification</option></select>
        <select v-if="tab === 'app'" v-model="level"><option value="">Tous les niveaux</option><option>INFO</option><option>WARNING</option><option>ERROR</option><option>CRITICAL</option></select>
        <select v-if="tab === 'polls'" v-model="job" @change="load"><option value="">Toutes les tâches</option><option v-for="name in jobs" :key="name">{{ name }}</option></select>
        <UiButton v-if="tab === 'pending' && rows.length" variant="danger" @click="purge"><Trash2 />Purger la file</UiButton>
      </FilterSidebar>
      <div class="psh-main">
    <TabNav :model-value="tab" :tabs="tabItems" aria-label="Type de journal" @update:model-value="selectTab" />
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
    <section class="panel table-wrap table-cards rich" tabindex="0" role="region" aria-label="Tableau des journaux, défilement horizontal">
      <table><thead><tr><th>Date</th><th>Section</th><th>Description</th><th>Résultat</th></tr></thead>
        <tbody><tr v-for="row in shown" :key="keyOf(row)"><td data-label="Date">{{ dateOf(row) }}</td><td data-label="Section"><UiBadge :tone="badgeTone(row)">{{ typeOf(row) }}</UiBadge></td><td class="card-title"><strong>{{ titleOf(row) }}</strong><small class="table-detail">{{ detailOf(row) }}</small></td><td data-label="Résultat">{{ resultOf(row) }}</td></tr></tbody>
      </table><UiFeedback v-if="loading" type="loading" message="Chargement des journaux…"/><UiEmptyState v-else-if="!filtered.length" message="Aucune entrée pour ce filtre." />
      <LoadMore
        :has-more="shown.length < filtered.length"
        :label="`Afficher plus d'entrées (${shown.length} sur ${filtered.length})`"
        @load="visibleCount += PAGE_SIZE"
      />
    </section>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->
  </div>
</template>

<script setup lang="ts">
import { formatDateTimeSeconds } from '@/utils/format';
import { computed, onMounted, ref, watch } from 'vue';
import { Trash2 } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import ConfirmModal from '@/components/ConfirmModal.vue';
import LoadMore from '@/components/ui/LoadMore.vue';
import { useConfirmedAction } from '@/composables/useConfirmedAction';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { useFetchState } from '@/composables/useFetchState';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiBadge from '@/components/ui/UiBadge.vue';

const tab = ref('diagnostic'), rows = ref<any[]>([]);
const { loading, error, execute: executeLoad } = useFetchState();
const search = ref(''), level = ref(''), category = ref(''), job = ref('');
const { dialog: confirmDialog, resolveConfirm, runConfirmed } = useConfirmedAction({ error });
const tabs = [{ id: 'diagnostic', label: 'Parcours demandes' }, { id: 'app', label: 'Application' }, { id: 'polls', label: 'Tâches planifiées' }, { id: 'audit', label: 'Audit admin' }, { id: 'pending', label: 'File notifications' }];
const tabItems = tabs.map((item) => ({ value: item.id, label: item.label }));
function selectTab(value: string): void { tab.value = value; load(); }
const jobs = computed(() => [...new Set(rows.value.map((x) => x.job).filter(Boolean))]);
const filtered = computed(() => rows.value.filter((row) => (!level.value || row.level === level.value) && (!search.value || JSON.stringify(row).toLowerCase().includes(search.value.toLowerCase()))));
const { filtersOpen, activeCount: activeFilterCount, toggle: toggleFilters, close: closeFilters, reset: resetFiltersDrawer } = useFiltersDrawer(
  { search, level, category, job },
  { search: '', level: '', category: '', job: '' },
  { onReset: () => { load(); } }
);
const PAGE_SIZE = 50;
const visibleCount = ref(PAGE_SIZE);
const shown = computed(() => filtered.value.slice(0, visibleCount.value));
watch(filtered, () => { visibleCount.value = PAGE_SIZE; });
function resetFilters(): void { resetFiltersDrawer(); }

function endpoint(): string {
  if (tab.value === 'diagnostic') return `/api/diagnostic-logs?limit=300${category.value ? `&category=${encodeURIComponent(category.value)}` : ''}${search.value ? `&search=${encodeURIComponent(search.value)}` : ''}`;
  if (tab.value === 'polls') return `/api/poll-history?limit=200${job.value ? `&job=${encodeURIComponent(job.value)}` : ''}`;
  if (tab.value === 'audit') return '/api/admin-action-logs?limit=200';
  if (tab.value === 'pending') return '/api/notifications/pending';
  return '/api/logs';
}
async function load(): Promise<void> { await executeLoad(async () => { const data = await api(endpoint()); rows.value = Array.isArray(data) ? data : (data.items || []); }); }
async function purge(): Promise<void> {
  await runConfirmed(async () => {
    await api('/api/notifications/pending/purge', { method: 'POST', body: JSON.stringify({ ids: [], mark_handled: false }) });
    await load();
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
function titleOf(r: any): string { return tab.value === 'diagnostic' ? (r.title || `Demande #${r.request_id || '-'}`) : (r.message || r.summary || r.media_title || `Demande #${r.req_id || '-'}`); }
function detailOf(r: any): string { if (tab.value === 'diagnostic') return `${r.action} — ${r.message || ''} ${r.details ? JSON.stringify(r.details) : ''}`; if (tab.value === 'app') return r.logger || ''; if (tab.value === 'polls') return r.error_detail || `${r.items_processed || 0} élément(s) traité(s)`; if (tab.value === 'audit') return r.actor_name || ''; return (r.recipients || []).join(', '); }
function resultOf(r: any): string { if (tab.value === 'diagnostic') return r.status || '-'; if (tab.value === 'polls') return r.errors ? `${r.errors} erreur(s)` : `${r.duration_ms || 0} ms`; if (tab.value === 'audit') return `${r.target_count || 0} cible(s)`; return r.valid ? 'Valide' : 'Invalide'; }
function badgeTone(r: any): string { if (r.status === 'error' || r.level === 'ERROR' || r.level === 'CRITICAL' || r.errors || r.valid === false) return 'danger'; if (r.status === 'warning' || r.status === 'ignored' || r.level === 'WARNING') return 'warning'; return 'success'; }
onMounted(load);
useRealtime(['request.updated', 'job.updated', 'notification.updated'], () => load());
</script>
