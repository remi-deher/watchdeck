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
    <div v-if="albumTracks.length" class="tracks-table-wrapper">
      <table class="tracks-table">
        <thead><tr><th class="col-num">#</th><th class="col-title">Titre de la piste</th><th class="col-artist">Artiste</th><th class="col-duration">Durée</th><th class="col-tech">Format & Qualité audio</th><th class="col-action">Écoute</th></tr></thead>
        <tbody>
          <tr v-for="track in albumTracks" :key="track.id">
            <td class="col-num">{{ track.track_number || '-' }}</td>
            <td class="col-title"><strong>{{ track.title }}</strong></td>
            <td class="col-artist">{{ track.artist || detail.title }}</td>
            <td class="col-duration">{{ track.duration_str || '--:--' }}</td>
            <td class="col-tech">
              <span v-if="track.codec" class="tech-badge codec-badge">{{ track.codec }}</span>
              <span v-if="track.bitrate" class="tech-badge">{{ track.bitrate }}</span>
              <span v-if="track.sample_rate" class="tech-badge hires-tag">{{ track.sample_rate }}</span>
            </td>
            <td class="col-action">
              <button v-if="track.plex_guid" type="button" class="track-listen-btn" title="Écouter la piste sur Plex" @click="emit('listen', track.plex_guid)">
                <Play :size="13" /> Écouter
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty-copy">Aucune piste répertoriée pour cet album dans Plex.</p>
  </section>
</template>

<script setup lang="ts">
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
.tracks-table th { padding: 12px 16px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,.04); color: var(--muted); font-size: var(--fs-xs); letter-spacing: .04em; text-transform: uppercase; }
.tracks-table td { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,.05); color: var(--text); vertical-align: middle; }
.tracks-table tr:last-child td { border-bottom: 0; }
.tracks-table tr:hover td { background: rgba(255,255,255,.03); }
.col-num { width: 48px; color: var(--muted); font-weight: 700; }
.col-duration { font-variant-numeric: tabular-nums; white-space: nowrap; }
.col-action { white-space: nowrap; }
.tech-badge { display: inline-block; padding: 2px 7px; margin-right: 4px; border: 1px solid rgba(255,255,255,.1); border-radius: 4px; background: #27272a; color: #a1a1aa; font-size: var(--fs-xs); font-weight: 700; }
.codec-badge { border: 0; background: #3b82f6; color: #fff; }
.hires-tag { border: 0; background: #7e22ce; color: #fff; }
.track-listen-btn { display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px; border: 0; border-radius: var(--radius-sm, 6px); background: var(--accent); color: #fff; cursor: pointer; font-size: var(--fs-xs); font-weight: 700; white-space: nowrap; transition: background-color .15s ease, transform .15s ease; }
.track-listen-btn:hover { background: var(--accent-hover, #e05206); transform: translateY(-1px); }
</style>
