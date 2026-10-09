<template>
  <!-- File d'attente FileFlows : par statut, recherche, bibliotheque ; relance, mise en
       tete, journal et duree reelle de chaque traitement. -->
  <EncodingShell title="File d'attente">
    <section class="queue" aria-label="Fichiers">
      <div class="queue-toolbar">
        <UiSearchField v-model:query="search" kind="search" placeholder="Rechercher un fichier…" aria-label="Rechercher un fichier" />
        <UiSelect v-model="library" :options="libraryOptions" aria-label="Bibliothèque" />
      </div>
      <div class="queue-toolbar">
        <UiChipGroup label="Statut" :options="statusOptions" :model-value="filterStatus" @update:model-value="(value) => (filterStatus = Number(value))" />
        <div v-if="selection.size" class="queue-selection">
          <span>{{ selection.size }} sélectionné{{ selection.size > 1 ? 's' : '' }}</span>
          <UiButton size="sm" @click="selection.clear()">Effacer</UiButton>
          <UiButton size="sm" variant="primary" :loading="reprocessMutation.isPending.value" @click="reprocessMutation.mutate([...selection])"><RotateCcw />Relancer</UiButton>
        </div>
        <UiButton v-else-if="selectableFiles.length" size="sm" @click="selectableFiles.forEach((file) => selection.add(file.uid))">Tout sélectionner</UiButton>
      </div>

      <UiFeedback v-if="filesQuery.isError.value" type="error" :message="humanizeError(filesQuery.error.value)" />
      <p v-else-if="filesQuery.isPending.value" class="queue-muted">Chargement des fichiers…</p>
      <UiEmptyState v-else-if="!files.length" compact :title="search || library ? 'Aucun fichier ne correspond' : 'Aucun fichier dans cet état'" />
      <ol v-else class="queue-list">
        <li v-for="(file, index) in files" :key="file.uid">
          <FileflowsFileRow
            :file="file"
            :position="showPositions ? index + 1 : null"
            :selectable="isSelectable(file)"
            :selected="selection.has(file.uid)"
            :busy="reprocessMutation.isPending.value && reprocessMutation.variables.value?.includes(file.uid)"
            @toggle="toggle"
            @log="logFile = $event"
            @reprocess="reprocessMutation.mutate([$event.uid])"
            @top="topMutation.mutate($event.uid)"
          />
        </li>
      </ol>
      <div v-if="page > 0 || hasMore" class="queue-pager">
        <UiButton size="sm" :disabled="page === 0" @click="page--"><ChevronLeft />Précédent</UiButton>
        <span>Page {{ page + 1 }}</span>
        <UiButton size="sm" :disabled="!hasMore" @click="page++">Suivant<ChevronRight /></UiButton>
      </div>
    </section>
    <FileflowsLogModal :file="logFile" @close="logFile = null" />
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { ChevronLeft, ChevronRight, RotateCcw } from '@lucide/vue';
import { api } from '@/api';
import { FILEFLOWS_STATUS, useFileflowsStatus, type FileflowsFile } from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiSearchField from '@/components/ui/UiSearchField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';
import FileflowsFileRow from '@/components/encoding/FileflowsFileRow.vue';
import FileflowsLogModal from '@/components/encoding/FileflowsLogModal.vue';

const STATUS_VALUES: number[] = [FILEFLOWS_STATUS.queued, FILEFLOWS_STATUS.processing, FILEFLOWS_STATUS.processed, FILEFLOWS_STATUS.failed];

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { addToast } = useToast();
const { status } = useFileflowsStatus();
const connected = computed(() => Boolean(status.value?.configured && status.value?.connected));

/* Les filtres vivent dans l'adresse : un lien (« 3 en échec ») y mene directement. */
function statusFromRoute(): number {
  const value = Number(route.query.status);
  return STATUS_VALUES.includes(value) ? value : FILEFLOWS_STATUS.queued;
}
const filterStatus = ref<number>(statusFromRoute());
watch(() => route.query.status, () => { filterStatus.value = statusFromRoute(); });
const search = ref(String(route.query.q || ''));
const library = ref(String(route.query.library || ''));
const debouncedSearch = refDebounced(search, 350);
const page = ref(0);
watch([filterStatus, debouncedSearch, library], () => {
  page.value = 0;
  selection.clear();
  const query: Record<string, string> = { status: String(filterStatus.value) };
  if (debouncedSearch.value.trim()) query.q = debouncedSearch.value.trim();
  if (library.value) query.library = library.value;
  void router.replace({ query });
});

const statusOptions = computed(() => [
  { value: FILEFLOWS_STATUS.queued, label: `En attente${countSuffix(status.value?.queue)}` },
  { value: FILEFLOWS_STATUS.processing, label: 'En cours' },
  { value: FILEFLOWS_STATUS.processed, label: 'Traités' },
  { value: FILEFLOWS_STATUS.failed, label: `En échec${countSuffix(status.value?.failed)}` },
]);
function countSuffix(value?: number): string {
  return value ? ` (${value})` : '';
}

const filesQuery = useQuery({
  queryKey: computed(() => queryKeys.fileflows.files(filterStatus.value, page.value, debouncedSearch.value.trim())),
  queryFn: ({ signal }) => {
    const params = new URLSearchParams({ status: String(filterStatus.value), page: String(page.value), search: debouncedSearch.value.trim() });
    return api<{ files: FileflowsFile[]; has_more: boolean }>(`/api/fileflows/files?${params}`, { signal });
  },
  enabled: connected,
  placeholderData: keepPreviousData,
  refetchInterval: 30_000,
});
/* Le filtre par bibliotheque porte sur la page chargee : FileFlows ne sait pas filtrer
   sa liste par bibliotheque. */
const allFiles = computed<FileflowsFile[]>(() => filesQuery.data.value?.files || []);
const libraryOptions = computed(() => [
  { value: '', label: 'Toutes les bibliothèques' },
  ...[...new Set(allFiles.value.map((file) => file.library).filter(Boolean))].sort().map((name) => ({ value: name, label: name })),
]);
const files = computed(() => (library.value ? allFiles.value.filter((file) => file.library === library.value) : allFiles.value));
const hasMore = computed(() => Boolean(filesQuery.data.value?.has_more));
/* Le rang dans la file n'a de sens que sur la liste complete des fichiers en attente. */
const showPositions = computed(() => filterStatus.value === FILEFLOWS_STATUS.queued && page.value === 0 && !library.value && !debouncedSearch.value.trim());

const selection = reactive(new Set<string>());
const isSelectable = (file: FileflowsFile) => file.status !== FILEFLOWS_STATUS.queued && file.status !== FILEFLOWS_STATUS.processing;
const selectableFiles = computed(() => files.value.filter(isSelectable));
function toggle(uid: string): void {
  if (selection.has(uid)) selection.delete(uid);
  else selection.add(uid);
}

const logFile = ref<FileflowsFile | null>(null);

function refreshAll(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
}

const reprocessMutation = useMutation({
  mutationFn: (uids: string[]) => api<{ queued: number; skipped: number; warnings: string[] }>('/api/fileflows/reprocess', { method: 'POST', body: JSON.stringify({ uids }) }),
  onSuccess: (result) => {
    const parts = [`${result.queued} fichier${result.queued > 1 ? 's' : ''} remis en file`];
    if (result.skipped) parts.push(`${result.skipped} déjà en file ou en cours`);
    addToast({ type: result.queued ? 'success' : 'info', message: [...parts, ...result.warnings].join(' · '), duration: result.warnings.length ? 8000 : 4000 });
    selection.clear();
    refreshAll();
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});

const topMutation = useMutation({
  mutationFn: (uid: string) => api(`/api/fileflows/files/${uid}/top`, { method: 'POST' }),
  onSuccess: () => {
    addToast({ type: 'success', message: 'Fichier mis en tête de file' });
    refreshAll();
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
</script>

<style scoped lang="scss">
.queue { display: grid; gap: var(--space-3); }
.queue-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.queue-toolbar > :first-child { flex: 1; min-width: 220px; }
.queue-selection { display: flex; align-items: center; gap: var(--space-2); color: var(--muted); font-size: var(--fs-sm); }
.queue-muted { margin: 0; color: var(--muted); }
.queue-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.queue-pager { display: flex; align-items: center; justify-content: center; gap: var(--space-3); color: var(--muted); font-size: var(--fs-sm); }
</style>
