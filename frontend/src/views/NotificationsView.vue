<template>
<div class="page">
    <PageSearchHeader title="Notifications" description="Historique des envois et file de distribution." eyebrow="Administration" v-model:query="search" placeholder="Média, destinataire ou événement" has-filters :active-count="activeFilterCount" :filters-open="filtersOpen" @toggle-filters="toggleFilters">
      <template #actions>
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
    </PageSearchHeader>

  <Transition name="notification-feedback">
    <UiFeedback v-if="feedbackMessage" :type="feedbackType" :message="feedbackMessage" />
  </Transition>

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />

  <div class="psh-layout">
    <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
      <NotificationsFiltersBar v-if="tab==='history'" v-model:state="state" v-model:selected-types="selectedTypes" v-model:selected-users="selectedUsers" :users="users" :type-options="typeOptions" />
      <template v-if="tab==='pending' && rows.length">
        <UiButton @click="purge(true)"><CheckCheck/>Purger et marquer traitées</UiButton>
        <UiButton variant="danger" @click="purge(false)"><Trash2/>Purger</UiButton>
      </template>
    </FilterSidebar>
    <div class="psh-main">
  <NotificationsSubnav :active="tab" :pending-count="pendingTotal"/>
  <UiFeedback v-if="error" type="error" :message="error" />
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
  <NotificationsTable ref="tableRef" :rows="rows" :tab="tab" :loading="loading" @send="sendPending" @resend="resend" @mark-handled="markHandled" @delete-one="deleteOne" @preview="openPreview"/>

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
</div>
</template>

<script setup>
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import NotificationsSubnav from '@/components/settings/NotificationsSubnav.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CheckCheck, ChevronLeft, ChevronRight, PauseCircle, PlayCircle, Send, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import NotificationsFiltersBar from '@/components/notifications/NotificationsFiltersBar.vue';
import NotificationsTable from '@/components/notifications/NotificationsTable.vue';
import NotificationPreviewModal from '@/components/notifications/NotificationPreviewModal.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useAsyncAction } from '@/composables/useAsyncAction';
import { useDebounced } from '@/composables/useDebounced';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { useFetchState } from '@/composables/useFetchState';
import { useFeedback } from '@/composables/useFeedback';
import UiButton from '@/components/ui/UiButton.vue';
import BulkActionBar from '@/components/ui/BulkActionBar.vue';

const rows = ref([]);
const users = ref([]);
const route=useRoute(),router=useRouter();
const tab = ref(route.query.tab==='pending'?'pending':'history');
const { loading, error, execute: executeLoad } = useFetchState();
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

const total = ref(0);
const pendingTotal = ref(0);
const offset = ref(0);
const limit = 50;
const holdEnabled = ref(false);
const holdSaving = ref(false);
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
    onReset: () => {
      offset.value = 0;
      load();
    },
  }
);
function resetFilters() { resetFiltersDrawer(); }

watch(tab,value=>router.replace({path:'/notifications',query:{...route.query,tab:value}}));
watch(()=>route.query.tab,value=>{const next=value==='pending'?'pending':'history';if(tab.value!==next){tab.value=next;offset.value=0;load()}});

async function loadUsers() {
  try {
    const data = await api('/api/users');
    users.value = data || [];
  } catch(e) {
    console.error("Erreur chargement utilisateurs", e);
  }
}

async function loadHold() {
  try {
    const data = await api('/api/notifications/hold');
    holdEnabled.value = data.enabled;
    pendingTotal.value = data.pending_count ?? pendingTotal.value;
  } catch(e) { error.value = e.message; }
}

function showFeedback(type, text) { showFeedbackMessage(text, type); }

async function toggleHold(enabled) {
  const previous = holdEnabled.value;
  holdSaving.value = true;
  holdEnabled.value = enabled;
  try {
    const data = await api('/api/notifications/hold', { method: 'PUT', body: JSON.stringify({ enabled }) });
    holdEnabled.value = data.enabled;
    pendingTotal.value = data.pending_count ?? pendingTotal.value;
    showFeedback('success', data.message || (enabled ? 'Notifications mises en attente.' : 'Notifications automatiques réactivées.'));
  } catch(e) {
    holdEnabled.value = previous;
    showFeedback('error', `Le changement n'a pas été enregistré : ${e.message}`);
  } finally {
    holdSaving.value = false;
  }
}

async function load() {
  await executeLoad(async () => {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset.value) });
    if (state.value) q.append('state', state.value);
    if (selectedTypes.value.length) q.append('types', selectedTypes.value.join(','));
    if (selectedUsers.value.length) q.append('users', selectedUsers.value.join(','));
    if (search.value) q.append('search', search.value);

    const data = tab.value === 'history'
      ? await api(`/api/notifications/log?${q.toString()}`)
      : await api(`/api/notifications/pending?limit=${limit}&offset=${offset.value}`);

    rows.value = data.items || [];
    total.value = data.total || 0;

    if (tab.value === 'pending') {
      pendingTotal.value = data.total || 0;
    }
  });
}

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
// (le `error` réutilisé ici est le même que celui du chargement de liste, déjà lié dans le
// template) et le rechargement après succès, dans le même ordre qu'avant.
const { run } = useAsyncAction({ askConfirm, onDone: load, error });

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
  load();
}

// Relance auto sur modif des filtres (avec reset de l'offset)
watch([state, selectedTypes, selectedUsers], () => {
  offset.value = 0;
  load();
}, { deep: true });

const debouncedSearch = useDebounced(() => {
  offset.value = 0;
  load();
}, 300);
watch(search, debouncedSearch);

useRealtime(['notification.updated'], () => {
  // L'endpoint hold fournit deja le compteur de file : inutile de telecharger toute
  // la file pending quand l'utilisateur consulte seulement l'historique.
  loadHold();
  load();
}, { debounceMs: 250 });

onMounted(() => {
  loadUsers();
  loadHold();
  load();
});
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
}
.notification-control.paused { border-color: rgba(229, 160, 13, .6); }
.notification-control-icon { display: grid; place-items: center; flex: 0 0 auto; width: 30px; height: 30px; border-radius: var(--radius-sm); color: var(--green-text); background: rgba(34, 197, 94, .12); }
.notification-control-icon :deep(svg) { width: 17px; height: 17px; }
.notification-control.paused .notification-control-icon { color: var(--accent); background: rgba(229, 160, 13, .14); }
.notification-control-copy { display: grid; gap: 0; min-width: 0; flex: 1; }
.notification-control-copy strong { font-size: var(--fs-sm); }
.notification-control-copy strong::before { content: 'Distribution globale'; margin-right: .4rem; color: var(--muted); font-size: var(--fs-xs); font-weight: 700; }
.notification-control-copy span { display: none; }
.notification-control-action { display: flex; align-items: center; gap: .65rem; padding-left: .75rem; border-left: 1px solid var(--border); }
.notification-control-count { padding: .22rem .45rem; border: 1px solid rgba(229, 160, 13, .55); border-radius: var(--radius-xs); color: var(--accent); font-size: var(--fs-xs); font-weight: 700; white-space: nowrap; }
.notification-control.paused .notification-feedback { display: flex; align-items: center; gap: .45rem; margin: .9rem 0 0; padding: .7rem .85rem; border-radius: var(--radius-md); font-size: var(--fs-sm); }
.notification-feedback.success { color: var(--green-text); background: rgba(34, 197, 94, .1); }
.notification-feedback.error { color: var(--red-text); background: rgba(239, 68, 68, .1); }
.notification-feedback-enter-active, .notification-feedback-leave-active { transition: opacity .2s ease, transform .2s ease; }
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
