<template>
  <section v-if="detail.media_type === 'artist'" class="music-catalog-section">
    <h2 class="section-title">Albums {{ detail.title ? `de ${detail.title}` : '' }}</h2>
    <div v-if="artistAlbums.length" class="media-grid">
      <LibraryCard
        v-for="album in artistAlbums"
        :key="`album-${album.id}`"
        :item="album"
        view="grid"
        @open="emit('open-album', album)"
      />
    </div>
    <p v-else class="empty-copy">Aucun album répertorié pour cet artiste dans Plex.</p>
  </section>

  <section v-else-if="detail.media_type === 'album'" class="music-catalog-section">
    <h2 class="section-title">Pistes de l'album {{ detail.title ? `« ${detail.title} »` : '' }}</h2>
    <UiDataTable class="tracks-table-wrapper" :label="`Pistes de l'album ${detail.title || ''}`" :rows="albumTracks" :columns="TRACK_COLUMNS" :row-key="(t: any) => t.id">
      <template #empty><p class="empty-copy">Aucune piste répertoriée pour cet album dans Plex.</p></template>
      <template #cell-num="{ row: track }">{{ track.track_number || '-' }}</template>
      <template #cell-title="{ row: track }"><strong>{{ track.title }}</strong></template>
      <template #cell-artist="{ row: track }">{{ track.artist || detail.title }}</template>
      <template #cell-duration="{ row: track }">{{ track.duration_str || '--:--' }}</template>
      <template #cell-tech="{ row: track }">
        <span v-if="track.codec" class="tech-badge codec-badge">{{ track.codec }}</span>
        <span v-if="track.bitrate" class="tech-badge">{{ track.bitrate }}</span>
        <span v-if="track.sample_rate" class="tech-badge hires-tag">{{ track.sample_rate }}</span>
      </template>
      <template #cell-action="{ row: track }">
        <button v-if="track.plex_guid" type="button" class="track-listen-btn" title="Écouter la piste sur Plex" @click="emit('listen', track.plex_guid)">
          <Play :size="13" /> Écouter
        </button>
      </template>
    </UiDataTable>
  </section>
</template>

<script setup lang="ts">
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
const TRACK_COLUMNS: UiColumn[] = [
  { key: 'num', label: '#', className: 'col-num', sortable: true, sortValue: (t: any) => Number(t.track_number) || 0 },
  { key: 'title', label: 'Titre de la piste', className: 'col-title', card: 'title', sortable: true },
  { key: 'artist', label: 'Artiste', className: 'col-artist' },
  { key: 'duration', label: 'Durée', className: 'col-duration' },
  { key: 'tech', label: 'Format & Qualité audio', className: 'col-tech' },
  { key: 'action', label: 'Écoute', className: 'col-action', card: 'actions' },
];
import { Play } from '@lucide/vue';
import LibraryCard from '@/components/library/LibraryCard.vue';

defineProps<{
  detail: Record<string, any>;
  artistAlbums: any[];
  albumTracks: any[];
}>();

const emit = defineEmits<{
  'open-album': [album: any];
  listen: [plexGuid: string];
}>();
</script>

<style scoped lang="scss">
.music-catalog-section { margin-top: 1.5rem; }
.section-title { display: flex; align-items: center; gap: 8px; margin-bottom: 1rem; font-size: var(--fs-xl); }
.empty-copy { color: var(--muted); font-size: var(--fs-sm); }
.tracks-table-wrapper { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-md, 8px); background: var(--surface-2); }
.tracks-table { width: 100%; border-collapse: collapse; text-align: left; font-size: var(--fs-sm); }
.tracks-table th { padding: 12px 16px; border-bottom: 1px solid var(--border); background: rgb(var(--ink) / .04); color: var(--muted); font-size: var(--fs-xs); letter-spacing: .04em; text-transform: uppercase; }
.tracks-table td { padding: 12px 16px; border-bottom: 1px solid rgb(var(--ink) / .05); color: var(--text); vertical-align: middle; }
.tracks-table tr:last-child td { border-bottom: 0; }
.tracks-table tr:hover td { background: rgb(var(--ink) / .03); }
.col-num { width: 48px; color: var(--muted); font-weight: 700; }
.col-duration { font-variant-numeric: tabular-nums; white-space: nowrap; }
.col-action { white-space: nowrap; }
.tech-badge { display: inline-block; padding: 2px 7px; margin-right: 4px; border: 1px solid rgb(var(--ink) / .1); border-radius: var(--radius-xs); background: var(--surface-3); color: var(--muted); font-size: var(--fs-xs); font-weight: 700; }
.codec-badge { border: 0; background: var(--blue); color: #fff; }
.hires-tag { border: 0; background: var(--violet); color: #fff; }
.track-listen-btn { display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px; border: 0; border-radius: var(--radius-sm, 6px); background: var(--accent); color: #fff; cursor: pointer; font-size: var(--fs-xs); font-weight: 700; white-space: nowrap; transition: background-color var(--motion-duration-instant) var(--motion-ease-standard), transform var(--motion-duration-instant) var(--motion-ease-standard); }
.track-listen-btn:hover { background: var(--accent-hover); transform: translateY(-1px); }
</style>
