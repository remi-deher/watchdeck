<template>
  <!-- File de l'encodage (gabarit Suivre) : ou en est ce qui tourne ? Les echecs d'abord
       (cause et relance), puis ce que font les runners, puis la file dans l'ordre de
       passage (mise en tete), et les derniers termines avant l'historique. La recherche
       est celle de la barre du haut ; son action est la pause (pas de filtre : les groupes
       disent deja tout). -->
  <EncodingShell
    v-model:query="search"
    title="File"
    :search="{ placeholder: 'Rechercher un fichier…', kind: 'search', scope: 'File d’encodage' }"
  >

    <TrackTemplate
      :items="items"
      :recent="recent"
      history-to="/encoding/history"
      :updated="updated"
      :loading="queuedQuery.isPending.value"
      :labels="{ items: 'traitements', empty: 'Rien ne tourne', emptyDetail: 'Aucun fichier en cours, en attente ni en échec.' }"
      @action="onAction"
    />
    <FileflowsLogModal :file="logFile" @close="logFile = null" />
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { ArrowUpToLine, Film, RotateCcw, ScrollText } from '@lucide/vue';
import { api } from '@/api';
import { FILEFLOWS_STATUS, fileBaseName, formatSeconds, useFileflowsStatus, type FileflowsFile, type FileflowsMedia } from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatRelativeDate } from '@/utils/format';
import TrackTemplate, { type TrackItem, type TrackRecent } from '@/components/templates/TrackTemplate.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';
import FileflowsLogModal from '@/components/encoding/FileflowsLogModal.vue';

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { addToast } = useToast();
const { status, query: statusQuery } = useFileflowsStatus();
const connected = computed(() => Boolean(status.value?.configured && status.value?.connected));

/* Recherche et bibliotheque dans l'adresse : un lien y mene directement. */
const search = ref(String(route.query.q || ''));
const debouncedSearch = refDebounced(search, 350);
watch(debouncedSearch, () => {
  const query: Record<string, string> = {};
  if (debouncedSearch.value.trim()) query.q = debouncedSearch.value.trim();
  void router.replace({ query });
});

function filesQuery(state: number) {
  return useQuery({
    queryKey: computed(() => queryKeys.fileflows.files(state, 0, debouncedSearch.value.trim())),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ status: String(state), page: '0', search: debouncedSearch.value.trim() });
      return api<{ files: FileflowsFile[]; has_more: boolean }>(`/api/fileflows/files?${params}`, { signal });
    },
    enabled: connected,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}
const queuedQuery = filesQuery(FILEFLOWS_STATUS.queued);
const failedQuery = filesQuery(FILEFLOWS_STATUS.failed);

/* FileFlows ne filtre pas sa liste par bibliotheque : le filtre porte sur ce qui est charge. */
const queued = computed(() => (queuedQuery.data.value?.files || []));
const failed = computed(() => (failedQuery.data.value?.files || []));

function mediaTitle(media: FileflowsMedia): string {
  return media.year ? `${media.title} (${media.year})` : media.title;
}
const titleOf = (file: { name: string; media?: FileflowsMedia | null }) => (file.media ? mediaTitle(file.media) : fileBaseName(file.name));
const linkOf = (media?: FileflowsMedia | null) => (media ? `/library/media/library/${media.id}` : null);
const searched = (name: string) => !debouncedSearch.value.trim() || name.toLowerCase().includes(debouncedSearch.value.trim().toLowerCase());

/* Echecs (bloques), runners (en cours), file (en attente, dans l'ordre de passage). */
const items = computed<TrackItem[]>(() => [
  ...failed.value.map((file): TrackItem => ({
    key: `failed-${file.uid}`,
    state: 'blocked',
    title: titleOf(file),
    subtitle: [file.library, file.flow].filter(Boolean).join(' · '),
    poster: file.media?.poster_url || null,
    icon: Film,
    to: linkOf(file.media),
    cause: { headline: file.failure_reason || 'Traitement en échec', hint: 'Le journal donne le détail de l’étape qui a échoué.' },
    actions: [
      { key: `reprocess:${file.uid}`, label: 'Relancer', tone: 'primary', icon: RotateCcw, disabled: reprocessMutation.isPending.value },
      { key: `log:${file.uid}`, label: 'Journal', icon: ScrollText },
    ],
  })),
  ...(status.value?.runners || []).filter((runner) => searched(runner.name)).map((runner): TrackItem => ({
    key: `run-${runner.path}`,
    state: 'running',
    title: runner.media ? mediaTitle(runner.media) : fileBaseName(runner.name),
    subtitle: runner.library,
    poster: runner.media?.poster_url || null,
    backdrop: runner.media?.backdrop_url || null,
    icon: Film,
    to: linkOf(runner.media),
    step: runner.step || 'Démarrage…',
    progress: runner.percent || null,
  })),
  ...queued.value.map((file, index): TrackItem => ({
    key: `queued-${file.uid}`,
    state: 'waiting',
    title: titleOf(file),
    subtitle: file.library,
    note: file.relaunched ? 'relancé à la main' : '',
    to: linkOf(file.media),
    actions: index === 0 ? [] : [{ key: `top:${file.uid}`, label: 'En tête', icon: ArrowUpToLine, title: 'Mettre en tête de file' }],
  })),
]);

const recent = computed<TrackRecent[]>(() => (status.value?.recent_processed || []).slice(0, 5).map((file) => ({
  key: file.uid,
  title: titleOf(file),
  detail: file.timing ? formatSeconds(file.timing.processing_seconds) : (file.date ? formatRelativeDate(file.date) : ''),
  to: linkOf(file.media),
})));
const updated = computed(() => (statusQuery.dataUpdatedAt.value ? `Mis à jour ${formatRelativeDate(new Date(statusQuery.dataUpdatedAt.value)).replace(/^\p{Lu}/u, (c) => c.toLowerCase())}` : ''));

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

function onAction(_item: TrackItem, key: string): void {
  const [action, uid] = key.split(':');
  if (action === 'reprocess') reprocessMutation.mutate([uid]);
  else if (action === 'top') topMutation.mutate(uid);
  else if (action === 'log') logFile.value = failed.value.find((file) => file.uid === uid) || null;
}
</script>
