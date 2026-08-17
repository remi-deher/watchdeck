<template>
  <PanelCard title="État des scans" eyebrow="Maintenance" panel-class="scan-status-panel">
    <div class="scan-blocks">
      <ScanStatusItem title="Synchronisation Plex" :subtitle="statusSubtitle(plexSync, 'Médiathèque Plex', plexSync.items_synced, plexSync.total_items)" :status="plexSync.status" action-label="Sync" :progress="progress(plexSync.items_synced, plexSync.total_items)" @action="$emit('sync-plex')"><template #icon><Tv /></template></ScanStatusItem>
      <ScanStatusItem title="Analyse VF" :subtitle="statusSubtitle(vffScan, 'Détection des pistes audio', vffScan.items_scanned, vffScan.total_items)" :status="vffScan.status" action-label="Scan VF" :progress="progress(vffScan.items_scanned, vffScan.total_items)" @action="$emit('scan-vff')"><template #icon><Languages /></template></ScanStatusItem>
      <ScanStatusItem title="Vérification *arr" :subtitle="statusSubtitle(arrSync, 'Sonarr & Radarr', undefined, undefined, 'Vérification des instances...')" :status="arrSync.status" action-label="Sync Arr" @action="$emit('sync-arr')"><template #icon><Download /></template></ScanStatusItem>
      <ScanStatusItem title="Watchlists Plex" :subtitle="statusSubtitle(watchlistSync, 'Flux RSS & utilisateurs', undefined, undefined, 'Relève des flux RSS/Watchlist...')" :status="watchlistSync.status" action-label="Sync" @action="$emit('sync-watchlist')"><template #icon><BookmarkCheck /></template></ScanStatusItem>
    </div>

    <div v-if="vffCounts.vf_available != null" class="scan-counts-grid">
      <div class="count-pill available"><span class="count-label">VF</span><strong class="count-value">{{ vffCounts.vf_available }}</strong></div>
      <div class="count-pill pending"><span class="count-label">VO en attente</span><strong class="count-value">{{ vffCounts.vo_pending }}</strong></div>
      <div class="count-pill neutral"><span class="count-label">Non analysé</span><strong class="count-value">{{ vffCounts.unchecked }}</strong></div>
    </div>
  </PanelCard>
</template>

<script setup lang="ts">
import { formatDateTimeShort as formatDate } from '@/utils/format';
import { BookmarkCheck, Download, Languages, Tv } from '@lucide/vue';
import PanelCard from '@/components/ui/PanelCard.vue';
import ScanStatusItem from './ScanStatusItem.vue';

export interface ScanStatus { status?: string; total_items?: number; items_scanned?: number; items_synced?: number; finished_at?: string; }
export interface VffCounts { vf_available?: number; vo_pending?: number; unchecked?: number; }

withDefaults(defineProps<{ vffScan?: ScanStatus; plexSync?: ScanStatus; arrSync?: ScanStatus; watchlistSync?: ScanStatus; vffCounts?: VffCounts; }>(), {
  vffScan: () => ({ status: 'idle' }), plexSync: () => ({ status: 'idle' }), arrSync: () => ({ status: 'idle' }), watchlistSync: () => ({ status: 'idle' }), vffCounts: () => ({}),
});
defineEmits<{ (e: 'scan-vff'): void; (e: 'sync-plex'): void; (e: 'sync-arr'): void; (e: 'sync-watchlist'): void; }>();

function statusSubtitle(status: ScanStatus, fallback: string, current?: number, total?: number, runningText?: string): string {
  if (status.status === 'running') return runningText || `${current || 0} / ${total || '?'} items`;
  if (status.finished_at) return `Terminé le ${formatDate(status.finished_at)}`;
  return fallback;
}
function progress(current?: number, total?: number): number | null {
  if (!total) return 5;
  return Math.min(100, Math.max(0, Math.round(((current || 0) / total) * 100)));
}
</script>

<style scoped lang="scss">
.scan-status-panel { display: flex; flex-direction: column; gap: var(--space-3); }
.scan-blocks { display: flex; flex-direction: column; gap: var(--space-2); }
.scan-counts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin-top: auto; padding-top: var(--space-1); }
.count-pill { display: flex; flex-direction: column; gap: 1px; padding: 4px 6px; border-radius: var(--radius-xs); background: var(--surface-2); border: 1px solid var(--border); text-align: center; }
.count-pill.available { border-left: 2px solid var(--success); }
.count-pill.pending { border-left: 2px solid var(--warning); }
.count-pill.neutral { border-left: 2px solid var(--muted); }
.count-label { font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: .02em; }
.count-value { font-size: var(--fs-xs); font-weight: 700; color: var(--text); }
</style>
