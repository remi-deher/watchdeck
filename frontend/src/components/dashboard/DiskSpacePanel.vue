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
        <div
          class="progress-bar-wrap"
          role="meter"
          :aria-valuenow="Math.round(usedRatio(volume) * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`Occupation de ${volume.path}`"
        >
          <div class="progress-bar" :class="`is-${level(volume)}`" :style="{ width: `${usedRatio(volume) * 100}%` }"></div>
        </div>
        <div class="volume-chip-footer">
          <small>{{ formatBytes(volume.free_bytes) }} libres</small>
          <!-- La couleur ne suffit pas a porter le seuil : un volume critique le dit
               aussi en toutes lettres. -->
          <span :class="`level-${level(volume)}`">{{ Math.round(usedRatio(volume) * 100) }} % utilisé<template v-if="level(volume) !== 'ok'"> · {{ levelLabel(volume) }}</template></span>
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

/** Palier d'occupation : au-dela de 90% un import peut echouer, au-dela de 80% il faut
    surveiller. Le meme seuil sert a la couleur et au libelle. */
function level(volume: DiskVolume): 'ok' | 'warning' | 'critical' {
  const ratio = usedRatio(volume);
  if (ratio >= 0.9) return 'critical';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}

function levelLabel(volume: DiskVolume): string {
  return level(volume) === 'critical' ? 'presque plein' : 'à surveiller';
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
  font-size: var(--fs-xs);
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
/* Les trois paliers doivent se distinguer d'un coup d'oeil. L'etat sain utilisait
   `--accent`, c'est-a-dire l'ambre de marque, et le palier d'alerte un ambre voisin :
   un volume a 6% et un volume a 97% portaient la meme barre orange, alors que c'est
   l'information la plus critique de la page. La couleur semantique est desormais
   separee de l'accent. */
.progress-bar {
  height: 100%;
  background: var(--success);
  border-radius: inherit;
  transition: width 0.3s ease;
}
.progress-bar.is-warning {
  background: #f59e0b;
}
.progress-bar.is-critical {
  background: var(--danger);
}
.volume-chip-footer .level-warning { color: #f59e0b; font-weight: 700; }
.volume-chip-footer .level-critical { color: var(--danger); font-weight: 700; }
.volume-chip-footer {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--fs-xs);
}
.volume-chip-footer small {
  color: var(--muted);
}
.volume-chip-footer span {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
