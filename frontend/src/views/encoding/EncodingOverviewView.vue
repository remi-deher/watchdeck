<template>
  <!-- Centre de commande FileFlows : une colonne par disque (ce qui tourne, ce qui attend),
       ce qui demande une intervention, et ce qui vient de se terminer. -->
  <EncodingShell title="Encodage" :compact="false">
    <UiFeedback v-if="overviewQuery.isError.value" type="error" :message="humanizeError(overviewQuery.error.value)" />
    <template v-if="overview">
      <MetricGrid aria-label="Activité de FileFlows">
        <MetricCard label="En attente" :value="overview.state.queue" detail="Fichiers dans la file" to="/encoding/queue?status=0" />
        <MetricCard label="Traités" :value="overview.state.processed" detail="Depuis le début" to="/encoding/queue?status=1" />
        <MetricCard label="Débit" :value="rateLabel" :detail="rateDetail" />
        <MetricCard label="Fin estimée" :value="etaLabel" :detail="overview.eta_hours ? 'Au débit actuel' : 'Débit encore inconnu'" />
      </MetricGrid>

      <section class="lanes" aria-label="Disques">
        <article v-for="lane in overview.disks" :key="lane.disk" class="lane" :class="{ 'is-paused': lane.plex_paused, 'is-idle': !lane.running.length }">
          <header class="lane-head">
            <strong><HardDrive aria-hidden="true" />{{ lane.disk }}</strong>
            <span>{{ lane.waiting }} en attente</span>
          </header>
          <small class="lane-libs">{{ lane.libraries.join(' · ') }}</small>

          <div v-for="runner in lane.running" :key="runner.path" class="lane-run">
            <RouterLink v-if="runner.media" :to="`/library/media/library/${runner.media.id}`" class="lane-title" @click="ouvrirFicheAuClic($event, `/library/media/library/${runner.media.id}`)">{{ mediaTitle(runner.media) }}</RouterLink>
            <strong v-else class="lane-title">{{ fileBaseName(runner.name) }}</strong>
            <span class="lane-step">{{ runner.step || 'Démarrage…' }}</span>
            <UiProgress v-if="runner.percent" :value="runner.percent" :label="`${runner.step} : ${Math.round(runner.percent)} %`" />
          </div>
          <p v-if="!lane.running.length" class="lane-empty">{{ lane.waiting ? 'En attente d\'un runner' : 'Rien à traiter' }}</p>

          <footer class="lane-foot">
            <span v-if="lane.plex_paused" class="is-warning"><CirclePause aria-hidden="true" />En pause : lecture Plex{{ lane.plex_playing ? '' : ' (reprise imminente)' }}</span>
            <span v-else-if="lane.plex_playing" class="is-warning"><MonitorPlay aria-hidden="true" />Lecture Plex sur ce disque</span>
            <span v-if="lane.lock_waiting"><Lock aria-hidden="true" />{{ lane.lock_waiting }} fichier{{ lane.lock_waiting > 1 ? 's' : '' }} attend{{ lane.lock_waiting > 1 ? 'ent' : '' }} le disque</span>
          </footer>
        </article>
      </section>

      <div class="lower">
        <PanelCard title="À traiter" :empty="failures.length ? '' : 'Aucun échec récent.'">
          <div v-for="file in failures" :key="file.uid" class="mini-row">
            <TriangleAlert class="is-danger" aria-hidden="true" />
            <span class="mini-name" :title="file.failure_reason || file.name">{{ file.media ? mediaTitle(file.media) : fileBaseName(file.name) }}</span>
            <UiButton size="sm" :loading="reprocessMutation.isPending.value" @click="reprocessMutation.mutate(file.uid)"><RotateCcw />Relancer</UiButton>
          </div>
          <template #action><RouterLink to="/encoding/queue?status=4" class="panel-link">Échecs</RouterLink></template>
        </PanelCard>
        <PanelCard title="Terminés récemment" :empty="recent.length ? '' : 'Aucun traitement récent.'">
          <div v-for="file in recent" :key="file.uid" class="mini-row">
            <span class="mini-name">{{ file.media ? mediaTitle(file.media) : fileBaseName(file.name) }}</span>
            <span v-if="file.timing?.kind" class="kind">{{ PROCESSING_KIND_LABELS[file.timing.kind] }}</span>
            <span class="mini-time">{{ file.timing ? formatSeconds(file.timing.processing_seconds) : file.duration || '' }}</span>
          </div>
          <template #action><RouterLink to="/encoding/queue?status=1" class="panel-link">Tout voir</RouterLink></template>
        </PanelCard>
      </div>
    </template>
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { CirclePause, HardDrive, Lock, MonitorPlay, RotateCcw, TriangleAlert } from '@lucide/vue';
import { api } from '@/api';
import {
  PROCESSING_KIND_LABELS, fileBaseName, formatSeconds, useFileflowsStatus,
  type FileflowsMedia, type FileflowsOverview,
} from '@/composables/useFileflows';
import { useOuvrirFiche } from '@/composables/useMediaOverlay';
import { useToast } from '@/composables/useToast';
import { useRealtime } from '@/events';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';
import PanelCard from '@/components/ui/PanelCard.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';

const OVERVIEW_KEY = [...queryKeys.fileflows.all, 'overview'] as const;
const queryClient = useQueryClient();
const { addToast } = useToast();
const { auClic: ouvrirFicheAuClic } = useOuvrirFiche();
const { status } = useFileflowsStatus();

const overviewQuery = useQuery({
  queryKey: OVERVIEW_KEY,
  queryFn: ({ signal }) => api<FileflowsOverview>('/api/fileflows/overview', { signal }),
  enabled: computed(() => Boolean(status.value?.connected)),
  refetchInterval: 15_000,
});
useRealtime(['fileflows.updated'], () => {
  void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY }, { cancelRefetch: false });
});
const overview = computed(() => overviewQuery.data.value || null);
const failures = computed(() => (status.value?.recent_failed || []).slice(0, 5));
const recent = computed(() => (status.value?.recent_processed || []).slice(0, 5));

const rateLabel = computed(() => {
  const perHour = overview.value?.throughput.per_hour;
  return perHour == null ? '—' : `${Math.round(perHour)} / h`;
});
const rateDetail = computed(() => {
  const minutes = overview.value?.throughput.window_minutes || 0;
  return minutes ? `Sur les ${minutes} dernières minutes` : 'Mesure en cours';
});
const etaLabel = computed(() => {
  const hours = overview.value?.eta_hours;
  if (hours == null) return '—';
  if (hours < 1) return `~ ${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `~ ${Math.round(hours)} h`;
  return `~ ${Math.round(hours / 24)} j`;
});

function mediaTitle(media: FileflowsMedia): string {
  return media.year ? `${media.title} (${media.year})` : media.title;
}

const reprocessMutation = useMutation({
  mutationFn: (uid: string) => api('/api/fileflows/reprocess', { method: 'POST', body: JSON.stringify({ uids: [uid] }) }),
  onSuccess: () => {
    addToast({ type: 'success', message: 'Fichier remis en file' });
    void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.lanes { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); }
.lane { display: grid; align-content: start; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
.lane.is-paused { border-color: color-mix(in srgb, var(--amber) 55%, var(--border)); }
.lane.is-idle { background: var(--surface-2); }
.lane-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.lane-head strong { display: flex; align-items: center; gap: 6px; font-size: var(--fs-md); }
.lane-head svg { width: 16px; height: 16px; color: var(--muted); }
.lane-head span, .lane-libs { color: var(--muted); font-size: var(--fs-xs); }
.lane-run { display: grid; gap: 4px; padding: var(--space-2) 0; border-top: 1px solid var(--border); }
.lane-title { overflow: hidden; color: var(--text); font-weight: 650; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
a.lane-title:hover { text-decoration: underline; }
.lane-step { color: var(--muted); font-size: var(--fs-sm); }
.lane-empty { margin: 0; padding: var(--space-2) 0; border-top: 1px solid var(--border); color: var(--muted); font-size: var(--fs-sm); }
.lane-foot { display: grid; gap: 4px; font-size: var(--fs-xs); color: var(--muted); }
.lane-foot span { display: flex; align-items: center; gap: 6px; }
.lane-foot svg { width: 14px; height: 14px; }
.lane-foot .is-warning { color: var(--amber-text); }
.lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: var(--space-3); }
.mini-row { display: flex; align-items: center; gap: var(--space-2); padding: 6px 0; border-bottom: 1px solid var(--border); font-size: var(--fs-sm); }
.mini-row:last-child { border-bottom: 0; }
.mini-row svg { flex: none; width: 15px; height: 15px; }
.mini-row .is-danger { color: var(--red-text); }
.mini-name { overflow: hidden; flex: 1; min-width: 0; text-overflow: ellipsis; white-space: nowrap; }
.kind { padding: 1px 8px; border-radius: var(--radius-pill); background: var(--surface-2); color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; }
.mini-time { font-variant-numeric: tabular-nums; white-space: nowrap; }
@include bp.until(tablet) { .lower { grid-template-columns: 1fr; } }
</style>
