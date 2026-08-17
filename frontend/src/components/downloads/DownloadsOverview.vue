<template>
  <div class="downloads-overview">
    <div class="health-kpi-grid">
      <div class="health-kpi-card" :class="{ alert: attentionCount > 0 }"><span class="kpi-label">Attention</span><strong class="kpi-value">{{ attentionCount }}</strong><small>Éléments à traiter</small></div>
      <div class="health-kpi-card"><span class="kpi-label">En cours</span><strong class="kpi-value">{{ counts.downloading }}</strong><small>Transferts actifs</small></div>
      <div class="health-kpi-card"><span class="kpi-label">En attente</span><strong class="kpi-value">{{ counts.queued + counts.paused }}</strong><small>En file de téléchargement</small></div>
      <div class="health-kpi-card"><span class="kpi-label">Stockage utilisé</span><strong class="kpi-value">{{ storagePercent }}</strong><small>Capacité globale</small></div>
    </div>

    <section v-if="attentionItems.length" class="panel overview-panel attention-section">
      <UiSectionHeader title="Éléments à traiter immédiatement" description="Imports bloqués, médias à associer ou erreurs de téléchargement nécessitant votre action.">
        <template #meta><span class="badge error-badge">{{ attentionItems.length }} item(s)</span></template>
      </UiSectionHeader>
      <div class="mini-imports-list">
        <article v-for="item in attentionItems" :key="rowKey(item)" class="mini-import-item attention-item">
          <div class="mini-import-info"><strong>{{ item.title }}</strong><small>{{ item.instance || item.download_client }} · {{ statusLabel(item) }}</small></div>
          <UiButton size="sm" @click="$emit('resolve', item)">Résoudre</UiButton>
        </article>
      </div>
    </section>

    <InstanceOverviewGrid :arr-instances="arrInstances" :configured-clients="configuredClients" :arr-queue="arrQueue" :client-queue="clientQueue" :wanted-items="wantedItems" :prowlarr-stats="prowlarrStats" :client-stats="clientStats" />
    <DiskSpacePanel v-if="diskSpaceVolumes.length" :volumes="diskSpaceVolumes" class="overview-disk-space" />

    <div class="overview-activity-grid">
      <section class="panel overview-panel">
        <UiSectionHeader title="Derniers imports *Arr" description="Les 10 plus récents téléchargements importés.">
          <template #actions><UiButton size="sm" :to="{ path: '/downloads', query: { view: 'overview', sub: 'completed' } }">Tout voir</UiButton></template>
        </UiSectionHeader>
        <div v-if="recentImports.length" class="mini-imports-list">
          <article v-for="row in recentImports" :key="row.id" class="mini-import-item">
            <div class="mini-poster-wrap"><img v-if="row.poster_url && !hasPosterError(row)" :src="proxyUrl(row.poster_url, { width: 120 }) ?? undefined" :alt="row.title" class="mini-poster-img" loading="lazy" @error="onPosterError(row)" /><div v-else class="mini-poster-fallback"><Film v-if="row.media_type === 'movie'" /><Tv v-else /></div></div>
            <div class="mini-import-info"><strong>{{ row.title }}</strong><small>{{ row.instance_name || row.source }} · {{ formatDate(row.completed_at) }}</small></div>
          </article>
        </div>
        <UiEmptyState v-else title="Aucun import récent" compact />
      </section>

      <section class="panel overview-panel">
        <UiSectionHeader title="Derniers torrents ajoutés" description="Les 10 plus récents ajouts sur vos clients de téléchargement.">
          <template #actions><UiButton size="sm" :to="{ path: '/downloads', query: { view: 'clients' } }">Voir les clients</UiButton></template>
        </UiSectionHeader>
        <div v-if="recentTorrents.length" class="mini-torrents-list">
          <article v-for="row in recentTorrents" :key="row.hash" class="mini-torrent-item">
            <div class="mini-torrent-info"><strong>{{ row.title }}</strong><small>{{ row.client_name }} · {{ row.added_on ? formatTimestamp(row.added_on) : 'Date inconnue' }}</small></div>
            <span class="badge" :class="row.progress >= 100 ? 'available' : 'pending'">{{ Math.round(row.progress || 0) }}%</span>
          </article>
        </div>
        <UiEmptyState v-else title="Aucun torrent récent" compact />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Film, Tv } from '@lucide/vue';
import DiskSpacePanel from '@/components/dashboard/DiskSpacePanel.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';
import InstanceOverviewGrid from './InstanceOverviewGrid.vue';
import { isUnmatched, needsEpisodeImport, queueCounts, rowKey, statusKey, statusLabel } from '@/downloads/queueRules';
import { formatDateTime as formatDate } from '@/utils/format';
import { proxyUrl } from '@/utils/mediaImage';

const props = withDefaults(defineProps<{ queue?: any[]; history?: any[]; clientQueue?: any[]; clientErrors?: any[]; diskSpaceVolumes?: any[]; arrInstances?: any[]; configuredClients?: any[]; arrQueue?: any[]; wantedItems?: any[]; prowlarrStats?: Record<string, any>; clientStats?: Record<string, any> }>(), {
  queue: () => [], history: () => [], clientQueue: () => [], clientErrors: () => [], diskSpaceVolumes: () => [], arrInstances: () => [], configuredClients: () => [], arrQueue: () => [], wantedItems: () => [], prowlarrStats: () => ({}), clientStats: () => ({}),
});
defineEmits<{ resolve: [item: any] }>();

const failedPosters = ref(new Set<string>());
const counts = computed(() => queueCounts(props.queue));
const attentionItems = computed(() => props.queue.filter(row => isUnmatched(row) || needsEpisodeImport(row) || statusKey(row) === 'error'));
const attentionCount = computed(() => attentionItems.value.length + props.clientErrors.length);
const recentImports = computed(() => props.history.filter(row => ['radarr', 'sonarr'].includes(row.source)).slice(0, 10));
const recentTorrents = computed(() => [...props.clientQueue].sort((a, b) => (b.added_on || 0) - (a.added_on || 0)).slice(0, 10));
const storagePercent = computed(() => {
  const free = props.diskSpaceVolumes.reduce((sum, volume) => sum + (volume.free_bytes || 0), 0);
  const total = props.diskSpaceVolumes.reduce((sum, volume) => sum + (volume.total_bytes || 0), 0);
  return total > 0 ? `${Math.round(((total - free) / total) * 100)} %` : '—';
});
function posterKey(row: any): string { return [row.source || row.media_type || 'media', row.id || row.hash || row.poster_url || row.title].join(':'); }
function hasPosterError(row: any): boolean { return failedPosters.value.has(posterKey(row)); }
function onPosterError(row: any): void { failedPosters.value = new Set([...failedPosters.value, posterKey(row)]); }
function formatTimestamp(value: number | string): string { return formatDate(typeof value === 'number' && value <= 1e11 ? value * 1000 : value); }
</script>

<style scoped lang="scss">
.downloads-overview{display:grid}.health-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-3);margin-bottom:var(--space-4)}.health-kpi-card{display:flex;flex-direction:column;gap:2px;padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface)}.health-kpi-card.alert{border-color:color-mix(in srgb,var(--danger) 50%,var(--border));background:color-mix(in srgb,var(--danger) 6%,var(--surface))}.kpi-label{font-size:var(--fs-xs);color:var(--muted);font-weight:600}.kpi-value{font-size:var(--fs-xl);font-weight:800;color:var(--text)}.health-kpi-card.alert .kpi-value{color:var(--danger)}.health-kpi-card small{font-size:11px;color:var(--muted)}.attention-section{border-color:color-mix(in srgb,var(--danger) 40%,var(--border));background:color-mix(in srgb,var(--danger) 4%,var(--surface));margin-bottom:var(--space-4)}.attention-item{justify-content:space-between;border:1px solid var(--border);background:var(--surface)}.overview-disk-space{margin-top:var(--space-4)}.overview-activity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-4);margin-top:var(--space-4)}.overview-panel{display:flex;flex-direction:column;gap:var(--space-3);padding:16px}.mini-imports-list,.mini-torrents-list{display:flex;flex-direction:column;gap:10px}.mini-import-item{display:flex;align-items:center;gap:12px;padding:8px;border-radius:var(--radius-sm);background:var(--surface-2)}.mini-poster-wrap{width:32px;height:48px;border-radius:var(--radius-sm);overflow:hidden;background:var(--surface);display:flex;align-items:center;justify-content:center;flex-shrink:0}.mini-poster-img{width:100%;height:100%;object-fit:cover}.mini-poster-fallback svg{width:16px;height:16px;color:var(--muted)}.mini-import-info,.mini-torrent-info{display:flex;flex-direction:column;min-width:0;flex:1}.mini-import-info strong,.mini-torrent-info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--fs-xs)}.mini-import-info small,.mini-torrent-info small{color:var(--muted);font-size:11px}.mini-torrent-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:var(--radius-sm);background:var(--surface-2)}
@media(max-width:800px){.overview-activity-grid,.health-kpi-grid{grid-template-columns:1fr 1fr}}
</style>
