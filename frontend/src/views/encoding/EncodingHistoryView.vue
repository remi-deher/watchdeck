<template>
  <!-- Historique de l'encodage (gabarit Comprendre) : que s'est-il passe ? Les passages
       enregistres par Watchdeck, par jour, avec leur resultat ; le detail donne la cause d'un
       echec, l'avant / apres et les etapes, et propose de relancer. Les statistiques vivent
       dans l'onglet voisin (gabarit Analyser). -->
  <EncodingShell title="Historique">
    <UnderstandTemplate
      v-model:period="period"
      v-model:outcome="outcome"
      :events="events"
      :periods="PERIODS"
      :outcomes="OUTCOMES"
      :summary="summary"
      :open-key="openKey"
      :detail="detail"
      :loading="historyQuery.isPending.value"
      :exportable="false"
      empty-message="Aucun traitement ne correspond à la période et au résultat choisis."
      @open="openKey = $event.key"
      @close="openKey = ''"
      @action="relaunch"
    />
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import {
  PROCESSING_KIND_LABELS, fileBaseName, fileflowsHistoryQuery, formatSeconds, passChanges, useFileflowsStatus,
  type FileflowsPass, type FileflowsTiming,
} from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatBytes, formatDateTimeShort } from '@/utils/format';
import UnderstandTemplate, { type UnderstandDetail, type UnderstandEvent } from '@/components/templates/UnderstandTemplate.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';

const PERIODS = [
  { value: '7', label: '7 jours' },
  { value: '30', label: '30 jours' },
  { value: '365', label: '1 an' },
  { value: '36500', label: 'Tout' },
];
const OUTCOMES = [
  { value: 'all', label: 'Tout' },
  { value: 'processed', label: 'Réussis' },
  { value: 'failed', label: 'Échecs' },
];
const period = ref('30');
const outcome = ref('all');

const queryClient = useQueryClient();
const { addToast } = useToast();
const { status } = useFileflowsStatus();
const historyQuery = useQuery({
  ...fileflowsHistoryQuery(() => Number(period.value), 0, 500),
  enabled: computed(() => Boolean(status.value?.configured)),
});
const stats = computed(() => historyQuery.data.value?.stats || null);

/* Les passages de la periode et du resultat choisis. */
const passes = computed<FileflowsPass[]>(() => {
  const since = Date.now() - Number(period.value) * 86_400_000;
  return (historyQuery.data.value?.recent || []).filter((pass) => Date.parse(pass.ended_at) >= since && (outcome.value === 'all' || pass.status === outcome.value));
});
const kindLabel = (pass: FileflowsPass) => (pass.kind ? PROCESSING_KIND_LABELS[pass.kind] : '');
const events = computed<UnderstandEvent[]>(() => passes.value.map((pass) => ({
  key: String(pass.id),
  at: pass.ended_at,
  outcome: pass.status === 'failed' ? 'failed' : 'success',
  title: fileBaseName(pass.path),
  detail: pass.status === 'failed' ? (pass.failure_reason || 'Échec') : [kindLabel(pass), ...passChanges(pass).slice(-1)].filter(Boolean).join(' · '),
  context: pass.disk || '',
})));

const summary = computed(() => (stats.value ? [
  { key: 'processed', label: 'traités', value: String(stats.value.processed) },
  { key: 'failed', label: stats.value.failed > 1 ? 'échecs' : 'échec', value: String(stats.value.failed), tone: stats.value.failed ? 'danger' as const : 'neutral' as const },
  { key: 'saved', label: 'gagnés', value: formatBytes(Math.max(0, stats.value.saved_bytes)), tone: 'success' as const },
] : []));

/* Detail : le passage, puis ses etapes, chargees a l'ouverture. */
const openKey = ref('');
const openPass = computed(() => passes.value.find((pass) => String(pass.id) === openKey.value) || null);
const timingQuery = useQuery({
  queryKey: computed(() => [...queryKeys.fileflows.all, 'timing', openPass.value?.file_uid]),
  queryFn: ({ signal }) => api<FileflowsTiming>(`/api/fileflows/files/${openPass.value!.file_uid}/timing`, { signal }),
  enabled: computed(() => Boolean(openPass.value)),
  staleTime: 5 * 60_000,
});
const detail = computed<UnderstandDetail | null>(() => {
  const pass = openPass.value;
  if (!pass) return null;
  const size = (value: number | null | undefined) => (value ? formatBytes(value) : '—');
  return {
    title: fileBaseName(pass.path),
    subtitle: [formatDateTimeShort(pass.ended_at), pass.disk, pass.processing_seconds != null ? `traité en ${formatSeconds(pass.processing_seconds)}` : null].filter(Boolean).join(' · '),
    outcome: pass.status === 'failed' ? 'failed' : 'success',
    cause: pass.failure_reason || (passChanges(pass).join(' · ') || undefined),
    comparison: [
      { label: 'Taille', before: size(pass.original_size ?? pass.before?.size), after: pass.status === 'failed' ? '—' : size(pass.final_size ?? pass.after?.size) },
      { label: 'Vidéo', before: pass.before?.video?.codec || '—', after: pass.after?.video?.codec || '—' },
    ],
    steps: (timingQuery.data.value?.steps || []).map((step) => ({
      label: step.name,
      outcome: step.output === -1 ? 'failed' : 'success',
      duration: formatSeconds(step.seconds),
    })),
    links: pass.library_item_id ? [{ label: 'Ouvrir la fiche', to: `/library/media/library/${pass.library_item_id}` }] : [],
    action: { key: 'relaunch', label: 'Relancer' },
  };
});

const relaunchMutation = useMutation({
  mutationFn: (uid: string) => api('/api/fileflows/reprocess', { method: 'POST', body: JSON.stringify({ uids: [uid] }) }),
  onSuccess: () => {
    addToast({ type: 'success', message: 'Fichier remis en file' });
    void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
function relaunch(): void {
  if (openPass.value) relaunchMutation.mutate(openPass.value.file_uid);
}
</script>
