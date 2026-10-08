<template>
  <!-- Onglet Encodage de la fiche : les traitements FileFlows des fichiers de ce media. -->
  <section class="media-encoding" aria-label="Encodage FileFlows">
    <div class="encoding-head">
      <p class="encoding-hint">
        Fichiers du dossier <strong>{{ data?.folder || '…' }}</strong> connus de FileFlows.
        Une fois un traitement terminé, Watchdeck réanalyse les pistes du média.
      </p>
      <UiButton v-if="files.length" variant="primary" size="sm" :loading="reprocessAll.isPending.value" @click="reprocessAll.mutate(undefined)">
        <RotateCcw />Relancer {{ files.length > 1 ? `les ${files.length} fichiers` : 'le fichier' }}
      </UiButton>
    </div>

    <UiFeedback v-if="mediaQuery.isError.value" type="error" :message="humanizeError(mediaQuery.error.value)" />
    <p v-else-if="mediaQuery.isPending.value" class="encoding-loading">Recherche dans FileFlows…</p>
    <UiEmptyState v-else-if="!files.length" compact title="Aucun fichier dans FileFlows" message="Ce média n'est dans aucune bibliothèque FileFlows, ou son dossier porte un autre nom." />
    <div v-else class="encoding-files">
      <FileflowsFileRow
        v-for="file in files"
        :key="file.uid"
        :file="file"
        :show-media="false"
        :busy="reprocessAll.isPending.value && reprocessAll.variables.value?.includes(file.uid)"
        @log="logFile = $event"
        @reprocess="reprocessAll.mutate([$event.uid])"
      />
    </div>
    <FileflowsLogModal :file="logFile" @close="logFile = null" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { RotateCcw } from '@lucide/vue';
import { api } from '@/api';
import type { FileflowsFile } from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { useRealtime } from '@/events';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import FileflowsFileRow from '@/components/encoding/FileflowsFileRow.vue';
import FileflowsLogModal from '@/components/encoding/FileflowsLogModal.vue';

const props = defineProps<{ itemId: number }>();

const queryClient = useQueryClient();
const { addToast } = useToast();
const logFile = ref<FileflowsFile | null>(null);

const mediaQuery = useQuery({
  queryKey: computed(() => queryKeys.fileflows.media(props.itemId)),
  queryFn: ({ signal }) => api<{ configured: boolean; folder: string | null; files: FileflowsFile[] }>(`/api/fileflows/media/${props.itemId}`, { signal }),
  staleTime: 15_000,
});
const data = computed(() => mediaQuery.data.value || null);
const files = computed<FileflowsFile[]>(() => data.value?.files || []);

useRealtime(['fileflows.updated'], () => {
  void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.media(props.itemId) }, { cancelRefetch: false });
});

/* Sans liste : tous les fichiers du media que FileFlows connait. */
const reprocessAll = useMutation({
  mutationFn: (uids?: string[]) =>
    api<{ queued: number; skipped: number; warnings: string[] }>(`/api/fileflows/media/${props.itemId}/reprocess`, {
      method: 'POST',
      ...(uids ? { body: JSON.stringify({ uids }) } : {}),
    }),
  onSuccess: (result) => {
    const parts = [`${result.queued} fichier${result.queued > 1 ? 's' : ''} remis en file`];
    if (result.skipped) parts.push(`${result.skipped} déjà en file ou en cours`);
    addToast({ type: result.queued ? 'success' : 'info', message: [...parts, ...result.warnings].join(' · ') });
    void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
</script>

<style scoped lang="scss">
.media-encoding, .encoding-files { display: grid; gap: var(--space-2); }
.media-encoding { gap: var(--space-3); }
.encoding-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.encoding-hint { flex: 1; min-width: 240px; margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.encoding-hint strong { color: var(--text); overflow-wrap: anywhere; }
.encoding-loading { margin: 0; color: var(--muted); }
</style>
