<template>
  <section class="panel history-panel">
    <UiSectionHeader eyebrow="Historique" title="Dernières lectures"><template #meta><small>{{ items.length }} résultat{{ items.length>1?'s':'' }}</small></template></UiSectionHeader>
    <div class="history-table">
      <button v-for="item in items" :key="`${item.source}:${item.session_id}`" @click="$emit('select',item)">
        <MediaArtwork :src="item.thumb_url" :alt="displayTitle(item)" :type="item.media_type" size="history"/>
        <span class="history-title"><strong>{{ displayTitle(item) }}</strong><small>{{ item.user_name || 'Utilisateur Plex' }}</small></span>
        <span class="history-client">
          <span><Monitor/><strong>{{ deviceLabel(item) }}</strong></span>
          <span><Network/><code>{{ addressLabel(item) }}</code></span>
          <span class="history-place"><MapPin/><span>{{ locationLabel(item) }}</span></span>
        </span>
        <PlaybackMethodBadge :method="item.playback_method"/>
        <span class="history-duration">{{ formatDuration(item.watched_ms) }}</span>
        <time>{{ formatDate(item.started_at) }}</time>
      </button>
      <p v-if="!items.length" class="empty">Aucune lecture ne correspond aux filtres.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';
import { MapPin, Monitor, Network } from '@lucide/vue';
import { formatDurationExact as formatDuration, formatDateTimeShort } from '@/utils/format';
import MediaArtwork from './MediaArtwork.vue';
import PlaybackMethodBadge from './PlaybackMethodBadge.vue';

export interface HistoryItem {
  source?: string;
  session_id?: string | number;
  thumb_url?: string;
  media_type?: string;
  title?: string;
  grandparent_title?: string;
  user_name?: string;
  player?: string;
  product?: string;
  platform?: string;
  address?: string;
  geo_status?: string;
  geo_city?: string;
  geo_region?: string;
  geo_country?: string;
  geo_country_code?: string;
  playback_method?: string;
  watched_ms?: number;
  started_at?: string;
  [key: string]: any;
}

withDefaults(
  defineProps<{
    items?: HistoryItem[];
  }>(),
  {
    items: () => [],
  }
);

defineEmits<{
  (e: 'select', item: HistoryItem): void;
}>();

function displayTitle(item: HistoryItem): string {
  return item.grandparent_title ? `${item.grandparent_title} · ${item.title}` : item.title || '';
}
function deviceLabel(item: HistoryItem): string {
  return item.player || item.product || item.platform || 'Appareil inconnu';
}
function addressLabel(item: HistoryItem): string {
  return item.address || 'IP indisponible';
}
function locationLabel(item: HistoryItem): string {
  if (item.geo_status === 'local') return 'local';
  if (item.geo_status === 'anonymized') return 'Lieu masqué';
  return [item.geo_city, item.geo_region, item.geo_country_code || item.geo_country].filter(Boolean).join(', ') || 'Lieu indisponible';
}
const formatDate = (value: any) => formatDateTimeShort(value, '—');
</script>

<style scoped lang="scss">
.panel-head>small{color:var(--muted);font-size:var(--fs-sm)}.history-table{display:grid;margin-top:12px}.history-table button{display:grid;grid-template-columns:64px minmax(210px,1fr) minmax(190px,250px) 112px 84px 145px;gap: var(--space-4);align-items:center;width:100%;min-height:112px;padding:10px 12px;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text);text-align:left}.history-table button:hover{background:rgba(255,255,255,.045)}.history-title{display:grid;gap: var(--space-2);min-width:0}.history-title strong,.history-title small,.history-client strong,.history-client code,.history-place span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-title strong{font-size:var(--fs-base);line-height:1.4}.history-title small{color:color-mix(in srgb,var(--text) 76%,transparent);font-size:var(--fs-sm)}.history-client{display:grid;gap: var(--space-2);min-width:0}.history-client>span{display:flex;align-items:center;gap: var(--space-2);min-width:0;color:color-mix(in srgb,var(--text) 80%,transparent);font-size:var(--fs-sm);line-height:1.3}.history-client svg{flex:none;width:16px;height:16px;color:var(--muted)}.history-client code{font-family:inherit;font-size:var(--fs-sm);font-variant-numeric:tabular-nums}.history-place span{font-weight:600}.history-table time{color:color-mix(in srgb,var(--text) 72%,transparent);font-size:var(--fs-sm);line-height:1.4}.history-duration{font-size:var(--fs-md);font-weight:700;white-space:nowrap}@media(max-width:1150px){.history-table button{grid-template-columns:64px minmax(190px,1fr) minmax(180px,230px) 112px 80px}.history-table time{grid-column:2/4;font-size:var(--fs-xs)}.history-duration{grid-column:5;grid-row:1/3}}@media(max-width:800px){.history-table button{grid-template-columns:64px minmax(0,1fr) auto;gap:var(--space-3) var(--space-4);align-items:start}.history-client{grid-column:2}.history-duration{grid-column:2;grid-row:auto;font-size:var(--fs-sm)}.history-table time{grid-column:3;grid-row:2;font-size:var(--fs-xs)}.history-table :deep(.playback-badge){grid-column:3;grid-row:1}}@media(max-width:480px){.history-table button{grid-template-columns:58px minmax(0,1fr) auto;padding-inline:6px}.history-table time{display:none}.history-title strong{font-size:var(--fs-md)}.history-title small,.history-client>span,.history-client code{font-size:var(--fs-xs)}}
</style>
