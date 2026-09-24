<template>
  <AppPage title="Notifications" v-model:query="search" placeholder="Filtrer par média, destinataire ou événement" has-filters :active-count="activeFilterCount" :filters-open="filtersOpen" @toggle-filters="toggleFilters">

      <template #tools>
        <div class="notification-control" :class="{paused: holdEnabled}">
          <div class="notification-control-icon"><PauseCircle v-if="holdEnabled"/><PlayCircle v-else/></div>
          <div class="notification-control-copy">
            <strong>{{ holdEnabled ? 'Envoi suspendu' : 'Envoi actif' }}</strong>
            <span>{{ holdEnabled ? 'Les nouvelles notifications restent dans la file.' : 'Les notifications sont envoyées automatiquement.' }}</span>
          </div>
          <div class="notification-control-action">
            <span class="notification-control-count" v-if="pendingTotal">{{ pendingTotal }} en attente</span>
            <ToggleSwitch
              :model-value="holdEnabled"
              :label="holdEnabled ? 'Réactiver' : 'Mettre en attente'"
              :title="holdEnabled ? 'Réactiver les notifications automatiques' : 'Mettre les notifications en attente'"
              :disabled="holdSaving"
              @update:model-value="toggleHold"
            />
          </div>
        </div>
      </template>

  <Transition name="notification-feedback">
    <UiFeedback v-if="feedbackMessage" :type="feedbackType" :message="feedbackMessage" />
  </Transition>

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  <CollapsibleRoot class="panel" @update:open="deliveriesOpen = $event" :unmount-on-hide="false">
    <CollapsibleTrigger class="collapsible-trigger">Suivi des envois — clés uniques et confirmations</CollapsibleTrigger><CollapsibleContent class="collapsible-content">
    <p>Les envois sans confirmation restent bloqués pour vérification. Un Message-ID SMTP ne garantit pas à lui seul l'absence de doublon.</p>
    <UiDataTable label="Suivi des envois" :rows="deliveries" :columns="DELIVERY_COLUMNS" :row-key="(d) => d.send_key">
      <template #empty>Aucun envoi enregistré dans le nouveau suivi.</template>
      <template #cell-request="{ row: delivery }">#{{ delivery.req_id }}</template>
      <template #cell-state="{ row: delivery }">{{ deliveryStateLabels[delivery.state] || delivery.state }}<small>{{ delivery.detail }}</small></template>
      <template #cell-send_key="{ row: delivery }"><code>{{ delivery.send_key }}</code></template>
    </UiDataTable>
  </CollapsibleContent></CollapsibleRoot>

  <div class="psh-layout">
    <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
      <template v-if="tab==='history'">
        <FilterGroup label="État">
          <UiChipGroup label="État" :options="STATE_OPTIONS" v-model="state" />
        </FilterGroup>
        <FilterGroup label="Type">
          <UiChipGroup label="Type" multiple :options="typeOptions" v-model="selectedTypes" />
        </FilterGroup>
        <FilterGroup label="Utilisateur">
          <UiCombobox label="Utilisateur" multiple placeholder="Tous les utilisateurs" :options="userOptions" v-model="selectedUsers" />
        </FilterGroup>
      </template>
      <template v-if="tab==='pending' && rows.length">
        <UiButton @click="purge(true)"><CheckCheck/>Purger et marquer traitées</UiButton>
        <UiButton variant="danger" @click="purge(false)"><Trash2/>Purger</UiButton>
      </template>
    </FilterSidebar>
    <div class="psh-main">
  <AppSubnav :items="notificationSubnavItems" :active="tab" aria-label="Sections des notifications" />
  <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
  <BulkActionBar
    v-if="tab === 'pending'"
    :count="selectedIds.length"
    singular="notification sélectionnée"
    plural="notifications sélectionnées"
    @clear="tableRef?.clearSelection()"
  >
    <UiButton size="sm" @click="sendSelected"><template #icon><Send/></template>Envoyer</UiButton>
    <UiButton variant="danger" size="sm" @click="deleteSelected"><template #icon><Trash2/></template>Supprimer</UiButton>
  </BulkActionBar>
  <NotificationsTable ref="tableRef" :rows="rows" :tab="tab" :loading="loading" :sort="historySort" @update:sort="setHistorySort" @send="sendPending" @resend="resend" @mark-handled="markHandled" @delete-one="deleteOne" @preview="openPreview"/>

  <NotificationPreviewModal
    :open="previewOpen"
    :loading="previewLoading"
    :error="previewError"
    :subject="previewData?.subject || ''"
    :html="previewData?.html || ''"
    :note="previewData?.note || ''"
    :reconstructable="previewData?.reconstructable !== false"
    @close="previewOpen=false"
  />

  <div v-if="total>limit" class="pagination">
    <UiButton :disabled="offset===0" @click="page(-1)"><ChevronLeft/>Precedent</UiButton>
    <span>{{ offset+1 }}-{{ Math.min(offset+limit,total) }} sur {{ total }}</span>
    <UiButton :disabled="offset+limit>=total" @click="page(1)">Suivant<ChevronRight/></UiButton>
  </div>
    </div><!-- .psh-main -->
  </div><!-- .psh-layout -->
  </AppPage>
</template>

<script setup>
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';
import UiDataTable from '@/components/ui/UiDataTable.vue';
const DELIVERY_COLUMNS = [
  { key: 'request', label: 'Demande', card: 'title' },
  { key: 'event', label: 'Événement' },
  { key: 'recipient', label: 'Destinataire' },
  { key: 'state', label: 'État' },
  { key: 'send_key', label: "Clé d'envoi" },
];
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import AppSubnav from '@/components/ui/AppSubnav.vue';
import { notificationSections } from '@/notificationSections';
import { computed, ref, watch } from 'vue';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { CheckCheck, ChevronLeft, ChevronRight, PauseCircle, PlayCircle, Send, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiCombobox from '@/components/ui/UiCombobox.vue';
import NotificationsTable from '@/components/notifications/NotificationsTable.vue';
import NotificationPreviewModal from '@/components/notifications/NotificationPreviewModal.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useAsyncAction } from '@/composables/useAsyncAction';
import { refDebounced } from '@vueuse/core';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { humanizeError } from '@/utils/apiError';
import { useFeedback } from '@/composables/useFeedback';
import UiButton from '@/components/ui/UiButton.vue';
import BulkActionBar from '@/components/ui/BulkActionBar.vue';

const queryClient = useQueryClient();
const deliveryStateLabels = { prepared: 'Préparé', sending: 'En cours / à vérifier', sent: 'Accepté par le fournisseur', uncertain: 'Sans confirmation — à vérifier', cancelled: 'Annulé', obsolete: 'Devenu inutile', failed: 'Refusé' };
// Le suivi des envois n'est lu qu'une fois le panneau deplie.
const deliveriesOpen = ref(false);
const deliveriesQuery = useQuery({
  queryKey: ['notifications', 'deliveries'],
  queryFn: ({ signal }) => api('/api/notifications/deliveries', { signal }),
  select: (data) => data?.items || [],
  enabled: deliveriesOpen,
  staleTime: 15_000,
});
const deliveries = computed(() => deliveriesQuery.data.value || []);
watch(deliveriesQuery.error, (e) => { if (e) showFeedback('error', e.message); });
// Meme cle que la page Utilisateurs : les deux ecrans partagent le cache.
const usersQuery = useQuery({
  queryKey: ['users', 'list'],
  queryFn: ({ signal }) => api('/api/users', { signal }),
  select: (data) => (Array.isArray(data) ? data : []),
  staleTime: 30_000,
});
const users = computed(() => usersQuery.data.value || []);
const route=useRoute(),router=useRouter();
const tab = ref(route.query.tab==='pending'?'pending':'history');
const search = ref('');
const state = ref('');
const selectedTypes = ref([]);
const selectedUsers = ref([]);
const tableRef = ref(null);

const typeOptions = [
  { value: 'request', label: 'Demandes' },
  { value: 'available', label: 'Disponibilites' },
  { value: 'upgrade', label: 'Améliorations (VF)' },
  { value: 'correction', label: 'Corrections' },
  { value: 'failed', label: 'Erreurs systeme' }
];

const STATE_OPTIONS = [
  { value: '', label: 'Tous les états' },
  { value: 'success', label: 'Envoyées' },
  { value: 'error', label: 'Erreurs' },
];
const userOptions = computed(() => (users.value || []).map((user) => ({
  value: user.id,
  label: user.custom_name || user.display_name || user.plex_user_id,
})));

const offset = ref(0);
/* Tri de l'historique, fait par le serveur avant la pagination : un nouveau tri repart
   de la premiere page. */
const historySort = ref({ key: 'date', direction: 'desc' });
function setHistorySort(value) {
  historySort.value = value;
  offset.value = 0;
}
const limit = 50;
const { message: feedbackMessage, type: feedbackType, show: showFeedbackMessage } = useFeedback({ timeoutMs: 6000 });
const previewOpen = ref(false);
const previewLoading = ref(false);
const previewError = ref('');
const previewData = ref(null);
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

const selectedIds = computed(() => tableRef.value?.selectedIds || []);
const { filtersOpen, activeCount: activeFilterCount, toggle: toggleFilters, close: closeFilters, reset: resetFiltersDrawer } = useFiltersDrawer(
  { search, state, selectedTypes, selectedUsers },
  { search: '', state: '', selectedTypes: [], selectedUsers: [] },
  {
    activeCountFn: () => Number(Boolean(state.value)) + selectedTypes.value.length + selectedUsers.value.length,
    onReset: () => { offset.value = 0; },
  }
);
function resetFilters() { resetFiltersDrawer(); }

watch(tab,value=>router.replace({path:'/notifications',query:{...route.query,tab:value}}));
watch(()=>route.query.tab,value=>{const next=value==='pending'?'pending':'history';if(tab.value!==next){tab.value=next;offset.value=0}});

const holdQuery = useQuery({
  queryKey: ['notifications', 'hold'],
  queryFn: ({ signal }) => api('/api/notifications/hold', { signal }),
  staleTime: 15_000,
});
const holdEnabled = computed(() => Boolean(holdQuery.data.value?.enabled));
// Changer la suspension a un effet de bord : jamais de nouvelle tentative automatique.
const holdMutation = useMutation({
  mutationFn: (enabled) => api('/api/notifications/hold', { method: 'PUT', body: JSON.stringify({ enabled }) }),
  retry: 0,
  onSuccess: (data) => {
    queryClient.setQueryData(['notifications', 'hold'], (current) => ({ ...current, ...data }));
  },
});
const holdSaving = computed(() => holdMutation.isPending.value);

function showFeedback(type, text) { showFeedbackMessage(text, type); }

async function toggleHold(enabled) {
  try {
    if (!enabled) {
      const { counts: c } = await api('/api/notifications/resume-preview');
      const accepted = await askConfirm({
        title: 'Réactiver les notifications ?',
        message: `${c.ready} envoi(s) pertinent(s), ${c.old} de plus de 24 h, ${c.obsolete + c.cancelled + c.sent} déjà traité(s) ou devenu(s) inutile(s), ${c.uncertain} sans confirmation. Les notifications déjà en file resteront à examiner et à envoyer explicitement.`,
        confirmLabel: 'Réactiver les nouveaux envois',
      });
      if (!accepted) return;
    }
    const data = await holdMutation.mutateAsync(enabled);
    showFeedback('success', data.message || (enabled ? 'Notifications mises en attente.' : 'Notifications automatiques réactivées.'));
  } catch(e) {
    showFeedback('error', `Le changement n'a pas été enregistré : ${e.message}`);
  }
}

const serverSearch = refDebounced(search, 300);
const listQuery = useQuery({
  queryKey: computed(() => tab.value === 'history'
    ? ['notifications', 'history', { offset: offset.value, state: state.value, types: selectedTypes.value.join(','), users: selectedUsers.value.join(','), search: serverSearch.value, sort: historySort.value.key, direction: historySort.value.direction }]
    : ['notifications', 'pending', { offset: offset.value }]),
  queryFn: ({ signal }) => {
    if (tab.value === 'pending') return api(`/api/notifications/pending?limit=${limit}&offset=${offset.value}`, { signal });
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset.value) });
    if (state.value) q.append('state', state.value);
    if (selectedTypes.value.length) q.append('types', selectedTypes.value.join(','));
    if (selectedUsers.value.length) q.append('users', selectedUsers.value.join(','));
    if (serverSearch.value) q.append('search', serverSearch.value);
    q.append('sort', historySort.value.key);
    q.append('direction', historySort.value.direction);
    return api(`/api/notifications/log?${q.toString()}`, { signal });
  },
  // Garder la page precedente pendant le chargement, mais pas d'un onglet a l'autre.
  placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === tab.value ? keepPreviousData(previous) : undefined),
  staleTime: 10_000,
});
const rows = computed(() => listQuery.data.value?.items || []);
const total = computed(() => listQuery.data.value?.total || 0);
// Sur la file, le total de la liste est le compteur le plus frais ; ailleurs, celui de hold.
const pendingTotal = computed(() => (tab.value === 'pending' && listQuery.data.value ? total.value : holdQuery.data.value?.pending_count || 0));
const loading = computed(() => listQuery.isFetching.value);
const actionError = ref('');
const error = computed(() => {
  if (actionError.value) return actionError.value;
  const failure = listQuery.error.value || holdQuery.error.value;
  return failure ? humanizeError(failure) : '';
});
function invalidateNotifications() { return queryClient.invalidateQueries({ queryKey: ['notifications'] }); }
function load() { actionError.value = ''; return invalidateNotifications(); }

async function openPreview(row) {
  previewOpen.value = true;
  previewLoading.value = true;
  previewError.value = '';
  previewData.value = null;
  try {
    previewData.value = await api(`/api/notifications/${row.id}/preview`);
  } catch (e) {
    previewError.value = e.message;
  } finally {
    previewLoading.value = false;
  }
}

// Ces six mutations n'attrapaient aucune erreur : un échec réseau ou un 4xx du backend
// terminait en rejet de promesse non intercepté, sans rien afficher — l'utilisateur voyait
// juste le bouton ne rien faire. `run` restaure la confirmation, l'affichage de l'erreur
// (`actionError`, fusionné dans le `error` affiché) et l'invalidation du cache après succès.
const { run } = useAsyncAction({ askConfirm, onDone: invalidateNotifications, error: actionError });

function resend(row) {
  return run(() => api(`/api/notifications/${row.id}/resend`, { method: 'POST' }));
}

function sendPending(row) {
  return run(() => api('/api/notifications/pending/process', {
    method: 'POST',
    body: JSON.stringify({ ids: [row.id] }),
  }));
}

function purge(markHandled) {
  const ids = tableRef.value?.selectedIds || [];
  return run(async () => {
    await api('/api/notifications/pending/purge', { method: 'POST', body: JSON.stringify({ ids, mark_handled: markHandled }) });
    tableRef.value?.clearSelection();
  }, {
    confirm: {
      title: markHandled ? 'Marquer les notifications comme traitées ?' : 'Supprimer les notifications ?',
      message: `${ids.length ? ids.length : 'Toute la file'} notification(s) seront ${markHandled ? 'marquée(s) comme traitée(s)' : 'supprimée(s) définitivement'}.`,
      confirmLabel: markHandled ? 'Marquer comme traitées' : 'Supprimer',
      danger: !markHandled,
    },
  });
}

function markHandled(row) {
  return run(
    () => api('/api/notifications/pending/purge', { method: 'POST', body: JSON.stringify({ ids: [row.id], mark_handled: true }) }),
    {
      confirm: {
        title: 'Marquer cette notification comme traitée ?',
        message: `« ${row.media_title || row.event_label} » sera marquée comme traitée sans être envoyée.`,
        confirmLabel: 'Marquer comme traitée',
      },
    },
  );
}

function deleteOne(row) {
  return run(
    () => api('/api/notifications/pending/purge', { method: 'POST', body: JSON.stringify({ ids: [row.id], mark_handled: false }) }),
    {
      confirm: {
        title: 'Supprimer cette notification ?',
        message: `« ${row.media_title || row.event_label} » sera supprimée définitivement de la file.`,
        confirmLabel: 'Supprimer',
        danger: true,
      },
    },
  );
}

function sendSelected() {
  const ids = [...selectedIds.value];
  if (!ids.length) return;
  return run(async () => {
    await api('/api/notifications/pending/process', { method: 'POST', body: JSON.stringify({ ids }) });
    tableRef.value?.clearSelection();
  });
}

function deleteSelected() {
  const ids = [...selectedIds.value];
  if (!ids.length) return;
  return run(async () => {
    await api('/api/notifications/pending/purge', { method: 'POST', body: JSON.stringify({ ids, mark_handled: false }) });
    tableRef.value?.clearSelection();
  }, {
    confirm: {
      title: 'Supprimer la sélection ?',
      message: `${ids.length} notification(s) seront supprimée(s) définitivement.`,
      confirmLabel: 'Supprimer',
      danger: true,
    },
  });
}

function page(delta) {
  offset.value = Math.max(0, offset.value + delta * limit);
}

// Un nouveau filtre repart de la premiere page ; la cle de la liste fait le reste.
watch([state, selectedTypes, selectedUsers, serverSearch], () => { offset.value = 0; }, { deep: true });

// Invalider `['notifications']` relit la liste affichee et le compteur de suspension.
useRealtime(['notification.updated'], () => { void invalidateNotifications(); }, { debounceMs: 250 });

// Le compteur d'attente n'a de sens que sur la file : ailleurs il decrirait un etat
// qui n'est pas celui de la section affichee.
const notificationSubnavItems = computed(() =>
  notificationSections.map((section) => ({
    key: section.key,
    label: section.label,
    to: section.to,
    count: section.key === 'pending' && pendingTotal.value ? pendingTotal.value : null,
  }))
);
</script>

<style scoped lang="scss">
.notification-control {
  display: flex;
  align-items: center;
  gap: .6rem;
  min-width: min(520px, 52vw);
  height: 40px;
  padding: 0 .65rem;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .14);
  order: 3;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}
.notification-control.paused { border-color: rgba(229, 160, 13, .6); }
.notification-control-icon { display: grid; place-items: center; flex: 0 0 auto; width: 30px; height: 30px; border-radius: var(--radius-sm); color: var(--green-text); background: rgba(34, 197, 94, .12); }
.notification-control-icon :deep(svg) { width: 17px; height: 17px; }
.notification-control.paused .notification-control-icon { color: var(--accent); background: rgba(229, 160, 13, .14); }
.notification-control-copy { display: grid; gap: 0; min-width: 0; flex: 1; overflow: hidden; }
.notification-control-copy strong { display: block; font-size: var(--fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; overflow-wrap: normal; }
.notification-control-copy strong::before { content: 'Distribution globale'; margin-right: .4rem; color: var(--muted); font-size: var(--fs-xs); font-weight: 700; }
.notification-control-copy span { display: none; }
.notification-control-action { display: flex; align-items: center; gap: .65rem; padding-left: .75rem; border-left: 1px solid var(--border); }
.notification-control-count { padding: .22rem .45rem; border: 1px solid rgba(229, 160, 13, .55); border-radius: var(--radius-xs); color: var(--accent); font-size: var(--fs-xs); font-weight: 700; white-space: nowrap; }
.notification-control.paused .notification-feedback { display: flex; align-items: center; gap: .45rem; margin: .9rem 0 0; padding: .7rem .85rem; border-radius: var(--radius-md); font-size: var(--fs-sm); }
.notification-feedback.success { color: var(--green-text); background: rgba(34, 197, 94, .1); }
.notification-feedback.error { color: var(--red-text); background: rgba(239, 68, 68, .1); }
.notification-feedback-enter-active, .notification-feedback-leave-active { transition: opacity var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard); }
.notification-feedback-enter-from, .notification-feedback-leave-to { opacity: 0; transform: translateY(-4px); }
@media (max-width: 900px) {
  .notification-control { min-width: 0; max-width: calc(100vw - 3rem); }
  .notification-control-action { flex-wrap: wrap; justify-content: flex-end; }
}
@media (max-width: 767.98px) {
  .notification-control { align-items: flex-start; flex-direction: column; height: auto; padding: .65rem; }
  .notification-control-action { width: 100%; padding: .65rem 0 0; border-top: 1px solid var(--border); border-left: 0; }
  .notification-control-action button { flex: 1 1 auto; min-height: 44px; }
}
</style>
