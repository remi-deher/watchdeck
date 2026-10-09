<template>
  <!-- Statistiques de l'encodage (gabarit Analyser) : combien, de quoi c'est fait, comment
       ca evolue. Chaque chiffre est compare a la periode precedente ; une part de repartition
       ouvre la liste des passages concernes. Les pistes viendront du serveur. -->
  <EncodingShell title="Statistiques">
    <AnalyzeTemplate v-model:period="period" :kpis="kpis" :drill="drill" :loading="currentQuery.isPending.value" @close-drill="drill = null">
      <template #drill>
        <ul class="stats-drill">
          <li v-for="pass in drillPasses" :key="pass.id">
            <span>{{ fileBaseName(pass.path) }}</span>
            <small>{{ [pass.disk, pass.processing_seconds != null ? formatSeconds(pass.processing_seconds) : null].filter(Boolean).join(' · ') }}</small>
          </li>
          <li v-if="!drillPasses.length" class="stats-drill__empty">Aucun passage récent dans cette catégorie.</li>
        </ul>
      </template>
      <template #blocks>
        <PanelCard v-if="stats?.per_day.length" title="Traitements par jour" class="stats-wide">
          <LineChart :points="perDay" unit="traités" aria-label="Traitements par jour" :height="180" />
        </PanelCard>
        <BreakdownPanel title="Type de traitement" eyebrow="Ce qui a été fait" interactive :items="kindItems" @select="(value) => openDrill('kind', String(value))" />
        <BreakdownPanel title="Par disque" eyebrow="Fichiers traités" interactive :items="diskItems" @select="(value) => openDrill('disk', String(value))" />
        <BreakdownPanel title="Temps moyen par étape" eyebrow="Où passe le temps" :items="stepItems" />
      </template>
    </AnalyzeTemplate>
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import {
  PROCESSING_KIND_LABELS, fileBaseName, fileflowsHistoryQuery, formatSeconds, useFileflowsStatus,
  type FileflowsPass, type FileflowsStats, type ProcessingKind,
} from '@/composables/useFileflows';
import { formatBytes, formatDayMonth } from '@/utils/format';
import BreakdownPanel from '@/components/activity/BreakdownPanel.vue';
import LineChart from '@/components/ui/charts/LineChart.vue';
import PanelCard from '@/components/ui/PanelCard.vue';
import AnalyzeTemplate, { type AnalyzeDrill, type AnalyzeKpi, type AnalyzePeriod } from '@/components/templates/AnalyzeTemplate.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';

const DAYS: Record<AnalyzePeriod, number> = { '7d': 7, '30d': 30, '1y': 365, '5y': 1825, '10y': 3650, all: 36500 };
const period = ref<AnalyzePeriod>('30d');
const days = computed(() => DAYS[period.value]);

const { status } = useFileflowsStatus();
const enabled = computed(() => Boolean(status.value?.configured));
const currentQuery = useQuery({ ...fileflowsHistoryQuery(days, 0, 500), enabled });
/* La periode precedente, pour la comparaison ; « Tout » n'en a pas. */
const previousQuery = useQuery({ ...fileflowsHistoryQuery(days, days, 1), enabled: computed(() => enabled.value && period.value !== 'all') });
const stats = computed<FileflowsStats | null>(() => currentQuery.data.value?.stats || null);
const previous = computed<FileflowsStats | null>(() => (period.value === 'all' ? null : previousQuery.data.value?.stats || null));

function change(now: number | null | undefined, before: number | null | undefined): number | null {
  if (now == null || before == null || !before) return null;
  return Math.round(((now - before) / before) * 100);
}
const kpis = computed<AnalyzeKpi[]>(() => {
  const s = stats.value, p = previous.value;
  if (!s) return [];
  return [
    { key: 'processed', label: 'Traités', value: String(s.processed), change: change(s.processed, p?.processed) },
    { key: 'failed', label: 'Échecs', value: String(s.failed), change: change(s.failed, p?.failed), better: 'down' },
    { key: 'saved', label: 'Place gagnée', value: formatBytes(Math.max(0, s.saved_bytes)), change: change(s.saved_bytes, p?.saved_bytes) },
    { key: 'average', label: 'Temps moyen', value: s.average_seconds != null ? formatSeconds(s.average_seconds) : '—', detail: 'Par fichier, attente exclue', change: change(s.average_seconds, p?.average_seconds), better: 'down' },
  ];
});

const perDay = computed(() => (stats.value?.per_day || []).map((day) => ({ key: day.day, label: formatDayMonth(day.day), value: day.processed, detail: day.failed ? `${day.failed} échec${day.failed > 1 ? 's' : ''}` : '' })));
const kindLabel = (kind: string) => PROCESSING_KIND_LABELS[kind as ProcessingKind] || 'Autre';
const kindItems = computed(() => Object.entries(stats.value?.kinds || {}).map(([kind, count]) => ({ label: kindLabel(kind), value: count, rawValue: kind })));
const diskItems = computed(() => (stats.value?.disks || []).map((disk) => ({ label: disk.disk, value: disk.count, detail: `${formatSeconds(disk.average_seconds)} en moyenne`, rawValue: disk.disk })));
const stepItems = computed(() => (stats.value?.steps || []).map((step) => ({ label: step.name, value: Math.round(step.average_seconds), suffix: ' s' })));

/* Liste ouverte : les passages recents d'un type ou d'un disque. */
const drill = ref<AnalyzeDrill | null>(null);
const drillFilter = ref<{ by: 'kind' | 'disk'; value: string } | null>(null);
/* La repartition renvoie la valeur brute : la cle du type, ou le nom du disque. */
function openDrill(by: 'kind' | 'disk', value: string): void {
  drillFilter.value = { by, value };
  drill.value = { key: `${by}-${value}`, title: by === 'kind' ? `Type : ${kindLabel(value)}` : `Disque : ${value}`, exploreTo: '/encoding/history' };
}
const drillPasses = computed<FileflowsPass[]>(() => {
  const filter = drillFilter.value;
  if (!filter) return [];
  return (currentQuery.data.value?.recent || [])
    .filter((pass) => pass.status === 'processed' && (filter.by === 'kind' ? pass.kind === filter.value : pass.disk === filter.value))
    .slice(0, 20);
});
</script>

<style scoped lang="scss">
.stats-wide { grid-column: 1 / -1; }
.stats-drill { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: var(--fs-sm); }
.stats-drill li { display: flex; justify-content: space-between; gap: var(--space-3); padding: 4px 0; border-bottom: 1px solid var(--border); }
.stats-drill small, .stats-drill__empty { color: var(--muted); }
</style>
