<template>
  <!-- Vue d'ensemble de l'encodage (gabarit Surveiller) : est-ce que FileFlows tourne bien ?
       Les echecs et les disques bloques sont les points d'attention, les chiffres de la file
       les indicateurs, et chaque disque une partie, avec ce qu'il fait en une ligne. Le detail
       de ce qui tourne vit dans la File (gabarit Suivre). -->
  <EncodingShell title="Encodage">
    <MonitorTemplate
      :items="attention"
      :kpis="kpis"
      :zones="zones"
      :icons="{ queue: ListOrdered, disk: HardDrive }"
      :loading="overviewQuery.isPending.value"
      :refreshing="overviewQuery.isFetching.value"
      :labels="LABELS"
      @refresh="overviewQuery.refetch()"
    />
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { Cog, HardDrive, History, ListOrdered } from '@lucide/vue';
import { api } from '@/api';
import { fileBaseName, useFileflowsStatus, type FileflowsMedia, type FileflowsOverview } from '@/composables/useFileflows';
import { useRealtime } from '@/events';
import { queryKeys } from '@/queryKeys';
import MonitorTemplate, { type MonitorAttentionItem, type MonitorKpi, type MonitorZoneGroup } from '@/components/templates/MonitorTemplate.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';

const LABELS = {
  checkingTitle: 'Vérification de FileFlows…',
  checkingDetail: 'File, disques et échecs récents.',
  okTitle: 'L’encodage tourne',
  okDetail: 'Aucun échec récent, aucun disque bloqué.',
  refresh: 'Actualiser',
  kpisLabel: 'Activité de l’encodage',
  zonesLabel: 'Parties de l’encodage',
};

const OVERVIEW_KEY = [...queryKeys.fileflows.all, 'overview'] as const;
const queryClient = useQueryClient();
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

function mediaTitle(media: FileflowsMedia): string {
  return media.year ? `${media.title} (${media.year})` : media.title;
}

/* Points d'attention : chaque echec recent, puis les disques ou des fichiers attendent
   le verrou pendant qu'un autre disque a du travail, et les disques en pause lecture. */
const attention = computed<MonitorAttentionItem[]>(() => {
  const items: MonitorAttentionItem[] = (status.value?.recent_failed || []).slice(0, 5).map((file) => ({
    key: `failed-${file.uid}`,
    severity: 'error',
    area: 'queue',
    title: `${file.media ? mediaTitle(file.media) : fileBaseName(file.name)} a échoué`,
    detail: file.failure_reason || 'Traitement en échec',
    action: { label: 'Voir', to: '/encoding/queue' },
  }));
  for (const lane of overview.value?.disks || []) {
    if (lane.lock_waiting) {
      items.push({
        key: `lock-${lane.disk}`,
        severity: 'warn',
        area: 'disk',
        title: `${lane.disk} retient ${lane.lock_waiting} runner${lane.lock_waiting > 1 ? 's' : ''}`,
        detail: `${lane.lock_waiting > 1 ? 'Des fichiers attendent' : 'Un fichier attend'} que le disque se libère`,
        action: { label: 'Voir la file', to: '/encoding/queue' },
      });
    }
    if (lane.plex_paused) {
      items.push({
        key: `paused-${lane.disk}`,
        severity: 'info',
        area: 'disk',
        title: `${lane.disk} en pause`,
        detail: lane.plex_playing ? 'Lecture Plex en cours sur ce disque' : 'Reprise imminente après la lecture',
        action: { label: 'Réglages', to: '/encoding/settings' },
      });
    }
  }
  return items;
});

function rate(): string {
  const perHour = overview.value?.throughput.per_hour;
  return perHour == null ? '—' : String(Math.round(perHour));
}
function eta(): string {
  const hours = overview.value?.eta_hours;
  if (hours == null) return '—';
  if (hours < 1) return `~${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `~${Math.round(hours)} h`;
  return `~${Math.round(hours / 24)} j`;
}
const kpis = computed<MonitorKpi[]>(() => {
  const state = overview.value?.state;
  if (!state) return [];
  return [
    { key: 'running', label: 'En cours', value: String(state.processing), status: state.paused ? 'En pause' : state.processing ? 'Actif' : 'Au repos', tone: state.paused ? 'warn' : 'ok', to: '/encoding/queue' },
    { key: 'queue', label: 'En attente', value: String(state.queue), status: state.queue ? 'Dans la file' : 'File vide', tone: 'info', to: '/encoding/queue' },
    { key: 'rate', label: 'Débit', value: rate(), unit: '/h', status: overview.value?.throughput.window_minutes ? `Sur ${overview.value.throughput.window_minutes} min` : 'Mesure en cours', tone: 'ok', to: '/encoding/stats' },
    { key: 'eta', label: 'Fin estimée', value: eta(), status: overview.value?.eta_hours ? 'Au débit actuel' : 'Débit inconnu', tone: 'info', to: '/encoding/queue' },
  ];
});

/* Parties : un disque par carte (ce qu'il fait en une ligne), puis l'historique et la
   configuration. */
const zones = computed<MonitorZoneGroup[]>(() => [
  {
    label: 'Disques',
    items: (overview.value?.disks || []).map((lane) => ({
      key: `disk-${lane.disk}`,
      label: lane.disk,
      to: '/encoding/queue',
      icon: HardDrive,
      line: lane.plex_paused
        ? 'En pause : lecture Plex'
        : `${lane.running.length ? `${lane.running.length} en cours` : 'Au repos'} · ${lane.waiting} en attente`,
      severity: lane.lock_waiting ? 'warn' : null,
    })),
  },
  {
    label: 'Encodage',
    items: [
      { key: 'history', label: 'Historique', to: '/encoding/history', icon: History, line: `${status.value?.processed ?? 0} traités`, severity: null },
      { key: 'config', label: 'Configuration', to: '/encoding/libraries', icon: Cog, line: 'Bibliothèques, flows, réglages', severity: null },
    ],
  },
]);
</script>
