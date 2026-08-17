<template>
  <PanelCard
    title="Espace disque disponible"
    eyebrow="Stockage"
    panel-class="disk-space-panel-compact"
    :empty="volumes.length ? '' : 'Aucun disque détecté.'"
  >
    <template v-if="volumes.length" #action><small>{{ volumes.length }} disque(s)</small></template>

    <div class="volume-grid">
      <article v-for="volume in volumes" :key="volume.path" class="volume-chip">
        <div class="volume-chip-top">
          <strong :title="volume.path">{{ volume.path }}</strong>
          <span v-if="volumeLabel(volume)" class="volume-chip-tag">{{ volumeLabel(volume) }}</span>
        </div>
        <div class="progress-bar-wrap">
          <div
            class="progress-bar"
            :class="{ 'is-critical': usedRatio(volume) >= 0.9, 'is-warning': usedRatio(volume) >= 0.8 && usedRatio(volume) < 0.9 }"
            :style="{ width: `${usedRatio(volume) * 100}%` }"
          ></div>
        </div>
        <div class="volume-chip-footer">
          <small>{{ formatBytes(volume.free_bytes) }} libres</small>
          <span>{{ Math.round(usedRatio(volume) * 100) }} % utilisé</span>
        </div>
      </article>
    </div>

  </PanelCard>
</template>

<script setup lang="ts">
import { formatBytes } from '@/utils/format';
import PanelCard from '@/components/ui/PanelCard.vue';

export interface DiskVolume {
  path: string;
  total_bytes?: number;
  free_bytes?: number;
  sources?: string[];
}

withDefaults(
  defineProps<{
    volumes?: DiskVolume[];
  }>(),
  {
    volumes: () => [],
  }
);

function volumeLabel(volume: DiskVolume): string {
  const isSonarr = volume.sources?.some((s) => s.toLowerCase().includes('sonarr'));
  const isRadarr = volume.sources?.some((s) => s.toLowerCase().includes('radarr'));
  if (isSonarr && isRadarr) return 'Commun';
  if (isSonarr) return 'Sonarr';
  if (isRadarr) return 'Radarr';
  return '';
}

function usedRatio(volume: DiskVolume): number {
  if (!volume.total_bytes) return 0;
  return Math.min(1, Math.max(0, (volume.total_bytes - (volume.free_bytes || 0)) / volume.total_bytes));
}
</script>

<style scoped lang="scss">
.disk-space-panel-compact {
  padding: 16px;
}
:deep(.disk-space-panel-compact .ui-section-actions small) {
  color: var(--muted);
  font-size: var(--fs-xs);
}
.volume-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.volume-chip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.volume-chip-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.volume-chip-top strong {
  font-size: var(--fs-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.volume-chip-tag {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
  background: var(--surface);
  padding: 2px 6px;
  border-radius: var(--radius-pill);
}
.progress-bar-wrap {
  height: 6px;
  background: var(--surface);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
  transition: width 0.3s ease;
}
.progress-bar.is-warning {
  background: #f59e0b;
}
.progress-bar.is-critical {
  background: var(--danger);
}
.volume-chip-footer {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
}
.volume-chip-footer small {
  color: var(--muted);
}
.volume-chip-footer span {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
