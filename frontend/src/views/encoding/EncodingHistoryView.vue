<template>
  <!-- Historique des traitements enregistres par Watchdeck : volumes, gain de place, temps
       par disque et par etape, et derniers passages avec leur resume avant/apres. -->
  <EncodingShell title="Historique">
    <div class="hist-toolbar">
      <UiChipGroup label="Période" :options="periodOptions" :model-value="days" @update:model-value="(value) => (days = Number(value))" />
    </div>
    <UiFeedback v-if="historyQuery.isError.value" type="error" :message="humanizeError(historyQuery.error.value)" />
    <p v-else-if="historyQuery.isPending.value" class="hist-muted">Chargement de l'historique…</p>
    <template v-else-if="stats">
      <MetricGrid aria-label="Bilan de la période">
        <MetricCard label="Traités" :value="stats.processed" :detail="`Sur ${stats.days} jours`" />
        <MetricCard label="Échecs" :value="stats.failed" :detail="stats.failed ? 'Voir la file' : 'Aucun'" :to="stats.failed ? '/encoding/queue?status=4' : null" />
        <MetricCard label="Place gagnée" :value="formatBytes(Math.max(0, stats.saved_bytes))" :detail="stats.saved_bytes < 0 ? `${formatBytes(-stats.saved_bytes)} de plus au total` : 'Fichiers réécrits'" />
        <MetricCard label="Temps moyen" :value="stats.average_seconds != null ? formatSeconds(stats.average_seconds) : '—'" detail="Par fichier, attente exclue" />
      </MetricGrid>

      <PanelCard title="Par jour" :empty="stats.per_day.length ? '' : 'Aucun traitement sur la période.'">
        <div class="days" role="list">
          <div v-for="day in stats.per_day" :key="day.day" class="day" role="listitem" :title="`${formatDate(day.day)} : ${day.processed} traités, ${day.failed} échecs`">
            <span class="day-bar" :style="{ '--h': `${barHeight(day.processed + day.failed)}%`, '--f': `${share(day.failed, day.processed + day.failed)}%` }" />
            <small>{{ formatDayMonth(day.day) }}</small>
          </div>
        </div>
      </PanelCard>

      <div class="hist-grid">
        <PanelCard title="Type de traitement" :empty="Object.keys(stats.kinds).length ? '' : 'Aucune donnée.'">
          <div v-for="(count, kind) in stats.kinds" :key="kind" class="hist-row">
            <span>{{ kindLabel(String(kind)) }}</span>
            <span class="hist-bar" :style="{ '--w': `${share(count, stats.processed)}%` }" />
            <strong>{{ count }}</strong>
          </div>
        </PanelCard>
        <PanelCard title="Par disque" :empty="stats.disks.length ? '' : 'Aucune donnée.'">
          <div v-for="disk in stats.disks" :key="disk.disk" class="hist-row">
            <span>{{ disk.disk }}</span>
            <small>{{ disk.count }} fichiers</small>
            <strong>{{ formatSeconds(disk.average_seconds) }}</strong>
            <small v-if="disk.average_wait_seconds >= 1">+ {{ formatSeconds(disk.average_wait_seconds) }} d'attente</small>
          </div>
        </PanelCard>
      </div>

      <PanelCard title="Temps moyen par étape" :empty="stats.steps.length ? '' : 'Aucune donnée.'">
        <div v-for="step in stats.steps" :key="step.name" class="hist-row">
          <span class="hist-step">{{ step.name }}</span>
          <span class="hist-bar" :style="{ '--w': `${share(step.average_seconds, stats.steps[0]?.average_seconds || 1)}%` }" />
          <strong>{{ formatSeconds(step.average_seconds) }}</strong>
        </div>
      </PanelCard>

      <PanelCard title="Derniers passages" :empty="recent.length ? '' : 'Aucun passage enregistré.'">
        <div v-for="row in recent" :key="row.id" class="pass" :class="{ 'is-failed': row.status === 'failed' }">
          <div class="pass-main">
            <strong :title="row.path">{{ fileBaseName(row.path) }}</strong>
            <small>{{ [row.disk, row.kind ? kindLabel(row.kind) : null, formatDateTimeShort(row.ended_at)].filter(Boolean).join(' · ') }}</small>
            <small v-if="row.failure_reason" class="pass-error">{{ row.failure_reason }}</small>
            <small v-else-if="changes(row).length" class="pass-changes">{{ changes(row).join(' · ') }}</small>
          </div>
          <span class="pass-time">{{ row.processing_seconds != null ? formatSeconds(row.processing_seconds) : '' }}</span>
        </div>
      </PanelCard>
    </template>
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { PROCESSING_KIND_LABELS, fileBaseName, formatSeconds, useFileflowsStatus, type ProcessingKind } from '@/composables/useFileflows';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatBytes, formatDate, formatDateTimeShort, formatDayMonth } from '@/utils/format';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';
import PanelCard from '@/components/ui/PanelCard.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';

interface Summary { size?: number | null; video?: { codec?: string } | null; audio?: Array<{ codec?: string }>; subtitles?: Array<{ codec?: string }> }
interface Pass {
  id: number; status: string; kind: string | null; path: string; disk: string | null; ended_at: string;
  processing_seconds: number | null; failure_reason: string | null; before: Summary | null; after: Summary | null;
  original_size: number | null; final_size: number | null;
}
interface Stats {
  days: number; processed: number; failed: number; saved_bytes: number; average_seconds: number | null;
  per_day: Array<{ day: string; processed: number; failed: number }>;
  kinds: Record<string, number>;
  disks: Array<{ disk: string; count: number; average_seconds: number; average_wait_seconds: number }>;
  steps: Array<{ name: string; count: number; average_seconds: number }>;
}

const periodOptions = [
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '90 jours' },
];
const days = ref(30);
const { status } = useFileflowsStatus();
const historyQuery = useQuery({
  queryKey: computed(() => [...queryKeys.fileflows.all, 'history', days.value]),
  queryFn: ({ signal }) => api<{ stats: Stats; recent: Pass[] }>(`/api/fileflows/history?days=${days.value}`, { signal }),
  enabled: computed(() => Boolean(status.value?.configured)),
  staleTime: 60_000,
});
const stats = computed(() => historyQuery.data.value?.stats || null);
const recent = computed(() => historyQuery.data.value?.recent || []);

const maxPerDay = computed(() => Math.max(1, ...(stats.value?.per_day || []).map((d) => d.processed + d.failed)));
function barHeight(value: number): number {
  return Math.max(2, Math.round((value / maxPerDay.value) * 100));
}
function share(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}
function kindLabel(kind: string): string {
  return PROCESSING_KIND_LABELS[kind as ProcessingKind] || 'Autre';
}
/* Ce qui a change entre avant et apres : codec video, codecs audio, sous-titres texte. */
function changes(row: Pass): string[] {
  const before = row.before || {}, after = row.after;
  if (!after) return [];
  const out: string[] = [];
  if (before.video?.codec && after.video?.codec && before.video.codec !== after.video.codec) out.push(`Vidéo ${before.video.codec} → ${after.video.codec}`);
  const audio = (s: Summary) => (s.audio || []).map((a) => a.codec).join('+');
  if (audio(before) && audio(before) !== audio(after)) out.push(`Audio ${audio(before)} → ${audio(after)}`);
  const srt = (s: Summary) => (s.subtitles || []).filter((t) => t.codec === 'subrip').length;
  if (srt(before) > srt(after)) out.push(`${srt(before) - srt(after)} SRT → ASS`);
  if (row.original_size && row.final_size && row.original_size !== row.final_size) {
    const delta = Math.round(((row.final_size - row.original_size) / row.original_size) * 100);
    out.push(`taille ${delta > 0 ? '+' : ''}${delta} %`);
  }
  return out;
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.hist-toolbar { display: flex; justify-content: flex-end; }
.hist-muted { margin: 0; color: var(--muted); }
.days { display: flex; align-items: flex-end; gap: 4px; height: 140px; overflow-x: auto; }
.day { display: grid; flex: 1 0 18px; grid-template-rows: 1fr auto; gap: 4px; height: 100%; text-align: center; }
.day small { color: var(--muted); font-size: 10px; white-space: nowrap; }
.day-bar { align-self: end; height: var(--h); border-radius: 3px 3px 0 0; background: linear-gradient(to top, var(--red) var(--f), var(--accent) var(--f)); }
.hist-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.hist-row { display: grid; grid-template-columns: minmax(0, 12rem) minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); padding: 5px 0; font-size: var(--fs-sm); }
.hist-row small { color: var(--muted); font-size: var(--fs-xs); }
.hist-step { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hist-bar { height: 6px; border-radius: var(--radius-pill); background: linear-gradient(90deg, var(--accent) var(--w), var(--surface-2) var(--w)); }
.hist-row strong { font-variant-numeric: tabular-nums; }
.pass { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border); }
.pass:last-child { border-bottom: 0; }
.pass-main { display: grid; flex: 1; min-width: 0; gap: 2px; }
.pass-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-sm); }
.pass-main small { color: var(--muted); font-size: var(--fs-xs); }
.pass-error { color: var(--red-text) !important; }
.pass-changes { color: var(--text) !important; }
.pass-time { font-variant-numeric: tabular-nums; font-size: var(--fs-sm); }
@include bp.until(tablet) { .hist-grid { grid-template-columns: 1fr; } .hist-row { grid-template-columns: minmax(0, 8rem) minmax(0, 1fr) auto; } }
</style>
