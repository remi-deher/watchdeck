<template>
  <!-- Journal d'un traitement FileFlows : la fin explique un echec, on y descend d'emblee. -->
  <ModalShell :open="Boolean(file)" :title="file ? fileBaseName(file.name) : ''" subtitle="Journal du traitement" panel-class="fileflows-log-modal" @close="emit('close')">
    <UiFeedback v-if="logQuery.isError.value" type="error" :message="humanizeError(logQuery.error.value)" />
    <p v-else-if="logQuery.isPending.value" class="log-loading">Chargement du journal…</p>
    <template v-else>
      <div class="log-tools">
        <UiSearchField v-model:query="filter" kind="filter" placeholder="Filtrer les lignes…" aria-label="Filtrer le journal" />
        <UiButton size="sm" @click="copy"><Copy />Copier</UiButton>
      </div>
      <pre ref="pre" class="log-text">{{ shown }}</pre>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { Copy } from '@lucide/vue';
import { api } from '@/api';
import { fileBaseName, type FileflowsFile } from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { humanizeError } from '@/utils/apiError';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiSearchField from '@/components/ui/UiSearchField.vue';

const props = defineProps<{ file: FileflowsFile | null }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { addToast } = useToast();
const filter = ref('');
const pre = ref<HTMLElement | null>(null);
const uid = computed(() => props.file?.uid || '');
const logQuery = useQuery({
  queryKey: computed(() => ['fileflows', 'log', uid.value]),
  queryFn: ({ signal }) => api<{ text: string }>(`/api/fileflows/files/${uid.value}/log`, { signal }),
  enabled: computed(() => Boolean(uid.value)),
  staleTime: 30_000,
});
const text = computed(() => logQuery.data.value?.text || '');
const shown = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return text.value;
  return text.value.split('\n').filter((line) => line.toLowerCase().includes(needle)).join('\n');
});

watch([text, () => props.file], async () => {
  filter.value = '';
  await nextTick();
  if (pre.value) pre.value.scrollTop = pre.value.scrollHeight;
});

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shown.value);
    addToast({ type: 'success', message: 'Journal copié' });
  } catch {
    addToast({ type: 'error', message: 'Copie impossible dans ce navigateur' });
  }
}
</script>

<style scoped lang="scss">
:global(.fileflows-log-modal) { width: min(1100px, 100%); }
.log-tools { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.log-tools > :first-child { flex: 1; min-width: 0; }
.log-loading { margin: 0; color: var(--muted); }
.log-text {
  overflow: auto;
  max-height: min(70vh, 720px);
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--inset-radius);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-xs);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
