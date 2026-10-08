<template>
  <!-- Supervision de FileFlows : ce qui tourne, ce qui attend, ce qui a echoue, et les
       commandes utiles quand son interface web ne repond plus (relancer, pause). -->
  <AppPage
    title="Encodage"
    page-class="encoding-page"
    :query="search"
    placeholder="Rechercher un fichier…"
    search-scope="FileFlows"
    :hide-search="!connected"
    @update:query="search = $event"
  >
    <template v-if="connected" #actions>
      <UiButton v-if="status?.paused" variant="primary" :loading="pauseMutation.isPending.value" @click="pauseMutation.mutate(0)"><Play />Reprendre</UiButton>
      <UiMenu v-else label="Mettre en pause" align="end">
        <template #trigger><UiButton :loading="pauseMutation.isPending.value"><Pause />Pause</UiButton></template>
        <UiMenuItem v-for="option in PAUSE_OPTIONS" :key="option.minutes" @select="pauseMutation.mutate(option.minutes)">{{ option.label }}</UiMenuItem>
      </UiMenu>
      <UiButton :loading="statusQuery.isFetching.value" aria-label="Actualiser" @click="refreshAll"><RefreshCw /></UiButton>
    </template>

    <UiEmptyState v-if="status && !status.configured" title="FileFlows n'est pas branché" message="Ajoutez votre instance FileFlows dans Administration → Connexions → Médias (type « FileFlows »)." :icon="Clapperboard">
      <template #action><UiButton to="/settings/services/media" variant="primary">Ajouter FileFlows</UiButton></template>
    </UiEmptyState>
    <UiFeedback v-else-if="statusQuery.isError.value" type="error" :message="humanizeError(statusQuery.error.value)" />
    <UiFeedback v-else-if="status && status.connected === false" type="error" :message="`${status.instance?.name || 'FileFlows'} ne répond pas : ${status.error || 'connexion impossible'}`" />

    <template v-if="connected">
      <UiFeedback v-if="status?.paused" type="warning" :message="pausedMessage" />

      <MetricGrid aria-label="État de FileFlows">
        <MetricCard label="En attente" :value="status?.queue ?? '—'" detail="Fichiers dans la file" :to="statusLink(FILEFLOWS_STATUS.queued)" />
        <MetricCard label="En cours" :value="status?.processing ?? '—'" :detail="status?.time ? `Depuis ${status.time}` : 'Aucun traitement'" :to="statusLink(FILEFLOWS_STATUS.processing)" />
        <MetricCard label="Traités" :value="status?.processed ?? '—'" detail="Terminés avec succès" :to="statusLink(FILEFLOWS_STATUS.processed)" />
        <MetricCard label="En échec" :value="status?.failed ?? '—'" :detail="status?.failed ? 'À vérifier' : 'Aucun'" :to="statusLink(FILEFLOWS_STATUS.failed)" />
      </MetricGrid>

      <section v-if="status?.runners?.length" class="encoding-runners" aria-label="Traitements en cours">
        <article v-for="runner in status.runners" :key="runner.path" class="encoding-runner">
          <div class="runner-head">
            <LoaderCircle class="spin" aria-hidden="true" />
            <div class="runner-title">
              <strong>{{ runner.media ? mediaTitle(runner.media) : fileBaseName(runner.name) }}</strong>
              <small>{{ [runner.library, runner.media ? fileBaseName(runner.name) : ''].filter(Boolean).join(' · ') }}</small>
            </div>
            <span v-if="status.time" class="runner-time">{{ status.time }}</span>
          </div>
          <p class="runner-step">Bloc en cours : <strong>{{ runner.step || '—' }}</strong></p>
          <UiProgress v-if="runner.percent" :value="runner.percent" :label="`${runner.step} : ${runner.percent} %`" />
        </article>
      </section>

      <section class="encoding-files" aria-label="Fichiers">
        <div class="files-toolbar">
          <UiChipGroup label="Statut" :options="statusOptions" :model-value="filterStatus" @update:model-value="(value) => (filterStatus = Number(value))" />
          <div v-if="selection.size" class="files-selection">
            <span>{{ selection.size }} sélectionné{{ selection.size > 1 ? 's' : '' }}</span>
            <UiButton size="sm" @click="selection.clear()">Effacer</UiButton>
            <UiButton size="sm" variant="primary" :loading="reprocessMutation.isPending.value" @click="reprocessMutation.mutate([...selection])"><RotateCcw />Relancer</UiButton>
          </div>
          <UiButton v-else-if="selectableFiles.length" size="sm" @click="selectableFiles.forEach((file) => selection.add(file.uid))">Tout sélectionner</UiButton>
        </div>

        <UiFeedback v-if="filesQuery.isError.value" type="error" :message="humanizeError(filesQuery.error.value)" />
        <p v-else-if="filesQuery.isPending.value" class="files-loading">Chargement des fichiers…</p>
        <UiEmptyState v-else-if="!files.length" compact :title="search ? 'Aucun fichier ne correspond' : 'Aucun fichier dans cet état'" />
        <div v-else class="files-list">
          <FileflowsFileRow
            v-for="file in files"
            :key="file.uid"
            :file="file"
            :selectable="isSelectable(file)"
            :selected="selection.has(file.uid)"
            :busy="reprocessMutation.isPending.value && reprocessMutation.variables.value?.includes(file.uid)"
            @toggle="toggle"
            @log="logFile = $event"
            @reprocess="reprocessMutation.mutate([$event.uid])"
          />
        </div>
        <div v-if="page > 0 || hasMore" class="files-pager">
          <UiButton size="sm" :disabled="page === 0" @click="page--"><ChevronLeft />Précédent</UiButton>
          <span>Page {{ page + 1 }}</span>
          <UiButton size="sm" :disabled="!hasMore" @click="page++">Suivant<ChevronRight /></UiButton>
        </div>
      </section>

      <FileflowsReorderPanel />
    </template>

    <FileflowsLogModal :file="logFile" @close="logFile = null" />
  </AppPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { ChevronLeft, ChevronRight, Clapperboard, LoaderCircle, Pause, Play, RefreshCw, RotateCcw } from '@lucide/vue';
import { api } from '@/api';
import { FILEFLOWS_STATUS, fileBaseName, useFileflowsStatus, type FileflowsFile, type FileflowsMedia } from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatDateTime } from '@/utils/format';
import AppPage from '@/components/ui/AppPage.vue';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import FileflowsFileRow from '@/components/encoding/FileflowsFileRow.vue';
import FileflowsLogModal from '@/components/encoding/FileflowsLogModal.vue';
import FileflowsReorderPanel from '@/components/encoding/FileflowsReorderPanel.vue';

/* La pause laisse finir le fichier en cours (FileFlows ne l'interrompt pas). */
const PAUSE_OPTIONS = [
  { minutes: 60, label: 'Pendant 1 heure' },
  { minutes: 6 * 60, label: 'Pendant 6 heures' },
  { minutes: 24 * 60, label: 'Pendant 24 heures' },
  { minutes: 7 * 24 * 60, label: 'Pendant 7 jours' },
];
const STATUS_VALUES: number[] = [FILEFLOWS_STATUS.queued, FILEFLOWS_STATUS.processing, FILEFLOWS_STATUS.processed, FILEFLOWS_STATUS.failed];

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { addToast } = useToast();
const { query: statusQuery, status } = useFileflowsStatus();
const connected = computed(() => Boolean(status.value?.configured && status.value?.connected));

/* Le filtre vit dans l'adresse : un lien depuis l'accueil (« 3 en échec ») y mene directement. */
function statusFromRoute(): number {
  const value = Number(route.query.status);
  return STATUS_VALUES.includes(value) ? value : FILEFLOWS_STATUS.queued;
}
const statusLink = (value: number) => ({ path: '/encoding', query: { status: String(value) } });
const filterStatus = ref<number>(statusFromRoute());
watch(() => route.query.status, () => { filterStatus.value = statusFromRoute(); });
const search = ref(String(route.query.q || ''));
const debouncedSearch = refDebounced(search, 350);
const page = ref(0);
watch([filterStatus, debouncedSearch], () => {
  page.value = 0;
  selection.clear();
  const query: Record<string, string> = { status: String(filterStatus.value) };
  if (debouncedSearch.value.trim()) query.q = debouncedSearch.value.trim();
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
const files = computed<FileflowsFile[]>(() => filesQuery.data.value?.files || []);
const hasMore = computed(() => Boolean(filesQuery.data.value?.has_more));

const selection = reactive(new Set<string>());
const isSelectable = (file: FileflowsFile) => file.status !== FILEFLOWS_STATUS.queued && file.status !== FILEFLOWS_STATUS.processing;
const selectableFiles = computed(() => files.value.filter(isSelectable));
function toggle(uid: string): void {
  if (selection.has(uid)) selection.delete(uid);
  else selection.add(uid);
}

const logFile = ref<FileflowsFile | null>(null);

const pausedMessage = computed(() => {
  const until = status.value?.paused_until;
  const year = until ? new Date(until).getFullYear() : 0;
  return year > 2000 && year < 9000
    ? `FileFlows est en pause jusqu'au ${formatDateTime(until)}. Le fichier en cours se termine normalement.`
    : 'FileFlows est en pause. Le fichier en cours se termine normalement.';
});

function refreshAll(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
}

const pauseMutation = useMutation({
  mutationFn: (minutes: number) => api('/api/fileflows/pause', { method: 'POST', body: JSON.stringify({ minutes }) }),
  onSuccess: (_, minutes) => {
    addToast({ type: 'success', message: minutes ? 'FileFlows mis en pause' : 'FileFlows reprend les traitements' });
    refreshAll();
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});

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

function mediaTitle(media: FileflowsMedia): string {
  return media.year ? `${media.title} (${media.year})` : media.title;
}
</script>

<style scoped lang="scss">
.encoding-runners, .encoding-files, .files-list { display: grid; gap: var(--space-2); }
.encoding-files { gap: var(--space-3); }
.encoding-runner { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px solid color-mix(in srgb, var(--blue) 35%, var(--border)); border-radius: var(--radius-sm); background: var(--surface); }
.runner-head { display: flex; align-items: center; gap: var(--space-3); }
.runner-head > svg { flex: none; width: 18px; height: 18px; color: var(--blue-text); }
.runner-title { display: grid; flex: 1; min-width: 0; gap: 2px; }
.runner-title strong, .runner-title small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.runner-title small { color: var(--muted); font-size: var(--fs-xs); }
.runner-time { color: var(--muted); font-variant-numeric: tabular-nums; }
.runner-step { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.runner-step strong { color: var(--text); }
.files-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.files-selection { display: flex; align-items: center; gap: var(--space-2); color: var(--muted); font-size: var(--fs-sm); }
.files-loading { margin: 0; color: var(--muted); }
.files-pager { display: flex; align-items: center; justify-content: center; gap: var(--space-3); color: var(--muted); font-size: var(--fs-sm); }
.spin { animation: spin 1.2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
