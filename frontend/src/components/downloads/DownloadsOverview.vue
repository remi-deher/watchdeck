<template>
  <div class="downloads-overview">
    <div class="health-kpi-grid">
      <MetricCard
        label="Attention"
        :value="attentionCount"
        detail="Éléments à traiter"
        :icon="TriangleAlert"
        :card-class="
          attentionCount > 0 ? 'download-metric alert' : 'download-metric'
        "
      />
      <MetricCard
        label="En cours"
        :value="counts.downloading"
        detail="Transferts actifs"
        :icon="Download"
        card-class="download-metric"
      />
      <MetricCard
        label="En attente"
        :value="counts.queued + counts.paused"
        detail="En file de téléchargement"
        :icon="Clock3"
        card-class="download-metric"
      />
      <MetricCard
        label="Stockage utilisé"
        :value="storagePercent"
        detail="Capacité globale"
        :icon="HardDrive"
        card-class="download-metric"
      />
    </div>

    <PanelCard
      v-if="attentionItems.length"
      title="Éléments à traiter immédiatement"
      description="Imports bloqués, médias à associer ou erreurs de téléchargement nécessitant votre action."
      panel-class="overview-panel attention-section"
    >
      <template #action
        ><span class="badge error-badge"
          >{{ attentionItems.length }} item(s)</span
        ></template
      >
      <div class="mini-imports-list">
        <article
          v-for="item in attentionItems"
          :key="rowKey(item)"
          class="mini-import-item attention-item"
        >
          <div class="mini-import-info">
            <strong>{{ item.title }}</strong
            ><small
              >{{ item.instance || item.download_client }} ·
              {{ statusLabel(item) }}</small
            >
          </div>
          <UiButton size="sm" @click="$emit('resolve', item)"
            >Résoudre</UiButton
          >
        </article>
      </div>
    </PanelCard>

    <InstanceOverviewGrid
      :arr-instances="arrInstances"
      :configured-clients="configuredClients"
      :arr-queue="arrQueue"
      :client-queue="clientQueue"
      :wanted-items="wantedItems"
      :prowlarr-stats="prowlarrStats"
      :client-stats="clientStats"
    />
    <DiskSpacePanel
      v-if="diskSpaceVolumes.length"
      :volumes="diskSpaceVolumes"
      class="overview-disk-space"
    />

    <div class="overview-activity-grid">
      <PanelCard
        title="Derniers imports *Arr"
        description="Les 10 plus récents téléchargements importés."
        :empty="recentImports.length ? '' : 'Aucun import récent'"
        panel-class="overview-panel"
      >
        <template #action
          ><UiButton
            size="sm"
            :to="{
              path: '/downloads',
              query: { view: 'overview', sub: 'completed' },
            }"
            >Tout voir</UiButton
          ></template
        >
        <div v-if="recentImports.length" class="mini-imports-list">
          <article
            v-for="row in recentImports"
            :key="row.id"
            class="mini-import-item"
          >
            <div class="mini-poster-wrap">
              <img
                v-if="row.poster_url && !hasPosterError(row)"
                :src="proxyUrl(row.poster_url, { width: 120 }) ?? undefined"
                :alt="row.title"
                class="mini-poster-img"
                loading="lazy"
                @error="onPosterError(row)"
              />
              <div v-else class="mini-poster-fallback">
                <Film v-if="row.media_type === 'movie'" /><Tv v-else />
              </div>
            </div>
            <div class="mini-import-info">
              <strong>{{ row.title }}</strong
              ><small
                >{{ row.instance_name || row.source }} ·
                {{ formatDate(row.completed_at) }}</small
              >
            </div>
          </article>
        </div>
      </PanelCard>

      <PanelCard
        title="Derniers torrents ajoutés"
        description="Les 10 plus récents ajouts sur vos clients de téléchargement."
        :empty="recentTorrents.length ? '' : 'Aucun torrent récent'"
        panel-class="overview-panel"
      >
        <template #action
          ><UiButton
            size="sm"
            :to="{ path: '/downloads', query: { view: 'clients' } }"
            >Voir les clients</UiButton
          ></template
        >
        <div v-if="recentTorrents.length" class="mini-torrents-list">
          <article
            v-for="row in recentTorrents"
            :key="row.hash"
            class="mini-torrent-item"
          >
            <div class="mini-torrent-info">
              <strong>{{ row.title }}</strong
              ><small
                >{{ row.client_name }} ·
                {{
                  row.added_on ? formatTimestamp(row.added_on) : "Date inconnue"
                }}</small
              >
            </div>
            <span
              class="badge"
              :class="row.progress >= 100 ? 'available' : 'pending'"
              >{{ Math.round(row.progress || 0) }}%</span
            >
          </article>
        </div>
      </PanelCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Clock3,
  Download,
  Film,
  HardDrive,
  TriangleAlert,
  Tv,
} from "@lucide/vue";
import DiskSpacePanel from "@/components/dashboard/DiskSpacePanel.vue";
import UiButton from "@/components/ui/UiButton.vue";
import MetricCard from "@/components/ui/MetricCard.vue";
import PanelCard from "@/components/ui/PanelCard.vue";
import InstanceOverviewGrid from "./InstanceOverviewGrid.vue";
import {
  isUnmatched,
  needsEpisodeImport,
  queueCounts,
  rowKey,
  statusKey,
  statusLabel,
} from "@/downloads/queueRules";
import { formatDateTime as formatDate } from "@/utils/format";
import { proxyUrl } from "@/utils/mediaImage";

const props = withDefaults(
  defineProps<{
    queue?: any[];
    history?: any[];
    clientQueue?: any[];
    clientErrors?: any[];
    diskSpaceVolumes?: any[];
    arrInstances?: any[];
    configuredClients?: any[];
    arrQueue?: any[];
    wantedItems?: any[];
    prowlarrStats?: Record<string, any>;
    clientStats?: Record<string, any>;
  }>(),
  {
    queue: () => [],
    history: () => [],
    clientQueue: () => [],
    clientErrors: () => [],
    diskSpaceVolumes: () => [],
    arrInstances: () => [],
    configuredClients: () => [],
    arrQueue: () => [],
    wantedItems: () => [],
    prowlarrStats: () => ({}),
    clientStats: () => ({}),
  },
);
defineEmits<{ resolve: [item: any] }>();

const failedPosters = ref(new Set<string>());
const counts = computed(() => queueCounts(props.queue));
const attentionItems = computed(() =>
  props.queue.filter(
    (row) =>
      isUnmatched(row) || needsEpisodeImport(row) || statusKey(row) === "error",
  ),
);
const attentionCount = computed(
  () => attentionItems.value.length + props.clientErrors.length,
);
const recentImports = computed(() =>
  props.history
    .filter((row) => ["radarr", "sonarr"].includes(row.source))
    .slice(0, 10),
);
const recentTorrents = computed(() =>
  [...props.clientQueue]
    .sort((a, b) => (b.added_on || 0) - (a.added_on || 0))
    .slice(0, 10),
);
const storagePercent = computed(() => {
  const free = props.diskSpaceVolumes.reduce(
    (sum, volume) => sum + (volume.free_bytes || 0),
    0,
  );
  const total = props.diskSpaceVolumes.reduce(
    (sum, volume) => sum + (volume.total_bytes || 0),
    0,
  );
  return total > 0 ? `${Math.round(((total - free) / total) * 100)} %` : "—";
});
function posterKey(row: any): string {
  return [
    row.source || row.media_type || "media",
    row.id || row.hash || row.poster_url || row.title,
  ].join(":");
}
function hasPosterError(row: any): boolean {
  return failedPosters.value.has(posterKey(row));
}
function onPosterError(row: any): void {
  failedPosters.value = new Set([...failedPosters.value, posterKey(row)]);
}
function formatTimestamp(value: number | string): string {
  return formatDate(
    typeof value === "number" && value <= 1e11 ? value * 1000 : value,
  );
}
</script>

<style scoped lang="scss">
.downloads-overview {
  display: grid;
}
.health-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.health-kpi-grid :deep(.metric-card) {
  padding: 14px;
}
.health-kpi-grid :deep(.metric-card strong) {
  font-size: var(--fs-xl);
}
.health-kpi-grid :deep(.download-metric.alert) {
  border-color: color-mix(in srgb, var(--danger) 50%, var(--border));
  background: color-mix(in srgb, var(--danger) 6%, var(--surface));
}
.health-kpi-grid :deep(.download-metric.alert strong) {
  color: var(--red-text);
}
.attention-section {
  border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
  background: color-mix(in srgb, var(--danger) 4%, var(--surface));
  margin-bottom: var(--space-4);
}
.attention-item {
  justify-content: space-between;
  border: 1px solid var(--border);
  background: var(--surface);
}
.overview-disk-space {
  margin-top: var(--space-4);
}
.overview-activity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-4);
}
.overview-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 16px;
}
.mini-imports-list,
.mini-torrents-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mini-import-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.mini-poster-wrap {
  width: 32px;
  height: 48px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mini-poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mini-poster-fallback svg {
  width: 16px;
  height: 16px;
  color: var(--muted);
}
.mini-import-info,
.mini-torrent-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.mini-import-info strong,
.mini-torrent-info strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-xs);
}
.mini-import-info small,
.mini-torrent-info small {
  color: var(--muted);
  font-size: var(--fs-xs);
}
.mini-torrent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
@media (max-width: 800px) {
  .overview-activity-grid,
  .health-kpi-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
