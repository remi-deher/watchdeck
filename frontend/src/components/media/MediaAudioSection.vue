<template>
  <div class="vf-summary">
    <div v-if="vfDetail">
      <div v-if="vfDetail.media_type === 'show'">
        <div v-if="admin && sourceId" class="show-audio-head">
          <button
            type="button"
            class="button btn-align-streams"
            title="Aligner ou choisir les pistes audio et sous-titres par défaut pour toute la série"
            @click="openAlignModal('series')"
          >
            <SlidersHorizontal :size="15" />
            <span>Aligner toute la série</span>
          </button>
        </div>

        <SeasonEpisodeList
          :seasons="displayedSeasons"
          :episode-filter="episodeDisplayFilter"
          loading-text="Chargement des episodes..."
          @expand-season="$emit('expand-season', $event)"
        >
          <template #season-header="{ season }">
            <div class="season-summary-row">
              <strong>{{ seasonHeading(season) }}</strong>
              <div class="inline-row compact season-badges">
                <span class="badge available" v-if="season.counts?.vf">VF: {{ season.counts.vf }}</span>
                <span class="badge" v-if="season.counts?.vo">VO: {{ season.counts.vo }}</span>
                <span class="badge language-tag vf-secondary" v-if="season.counts?.vf_secondary">VF (sec.): {{ season.counts.vf_secondary }}</span>
                <span class="badge danger" v-if="season.counts?.absent">Absent: {{ season.counts.absent }}</span>
                <span class="badge pending_approval" v-if="season.counts?.tba">TBA: {{ season.counts.tba }}</span>
                <span class="badge" v-if="season.episode_count">{{ season.episode_count }} ep.</span>
                <MediaSubtitleAlerts :alerts="seasonSubtitleAlerts(season.counts)" context="season" :focusable="false" />
                <UiButton icon-only v-if="admin && sourceId" @click.prevent.stop="openAlignModal('season', season.season_number)" title="Aligner les pistes de cette saison sur Plex" aria-label="Aligner la saison">
                  <SlidersHorizontal :size="15" />
                </UiButton>
                <VfUpgradeButton
                  v-if="admin && sourceType && sourceId"
                  :source-type="sourceType"
                  :source-id="sourceId"
                  scope="season"
                  :season-number="season.season_number"
                  :media-title="mediaTitle"
                  label="Rechercher"
                />
                <UiButton icon-only @click.prevent="$emit('correction', 'season', season.season_number, null)" title="Corriger Saison" aria-label="Corriger Saison"><MessageSquareWarning :size="16" /></UiButton>
              </div>
            </div>
          </template>

          <template #episode="{ season, episode: ep }">
            <MediaEpisodeRow
              :number="ep.episode"
              :title="ep.title"
              :still="ep.still_url"
              :air-date="ep.air_date"
              :overview="ep.overview"
              :expanded="isEpisodeExpanded(season.season_number, ep.episode)"
              @toggle="toggleEpisode(season.season_number, ep.episode)"
            >
              <template #actions>
                <UiTooltip v-if="ep.isKnownEpisode === false" text="Non reconnu par Sonarr/TheTVDB : compté hors statut VF/VO/Mixte de la série"><span class="badge pending">Hors TVDB</span></UiTooltip>
                <UiButton icon-only v-if="admin && sourceId && ep.isKnownEpisode !== false && ep.status !== 'tba'" @click.prevent.stop="openAlignModal('episode', season.season_number, ep.episode)" title="Aligner les pistes de cet épisode sur Plex" aria-label="Aligner l'épisode">
                  <SlidersHorizontal :size="14" />
                </UiButton>
                <VfUpgradeButton
                  v-if="admin && sourceType && sourceId && ep.isKnownEpisode !== false && ep.status !== 'tba'"
                  :source-type="sourceType"
                  :source-id="sourceId"
                  scope="episode"
                  :season-number="season.season_number"
                  :episode-number="ep.episode"
                  :media-title="mediaTitle"
                  label="Rechercher"
                />
                <button
                  class="badge episode-status-btn"
                  :class="episodeStatusClass(ep.status)"
                  @click.stop="ep.status !== 'unknown' && $emit('correction', 'episode', season.season_number, ep.episode)"
                  :title="ep.status === 'unknown' ? 'Chargement...' : 'Signaler une correction'"
                >
                  {{ episodeStatusLabel(ep.status) }}
                </button>
              </template>
              <MediaStreamsDetail :tracks="ep.tracks" :subtitles="ep.subtitles" @click.stop />
            </MediaEpisodeRow>
          </template>
        </SeasonEpisodeList>
        <p v-if="!displayedSeasons.length" class="empty">{{ missingOnly ? 'Aucun épisode manquant.' : 'Aucun détail de saison disponible.' }}</p>
        <p v-if="availabilityError" class="notice error-text">Disponibilité (Sonarr) indisponible pour l'instant.</p>
        <p v-if="vfStatusError" class="notice error-text">Statut VF/VO indisponible pour l'instant.</p>
      </div>
      <div v-else>
        <div class="movie-audio-head">
          <h2>Pistes audio et sous-titres</h2>
          <div class="movie-audio-actions">
            <button
              v-if="admin && sourceId"
              type="button"
              class="button btn-align-streams"
              title="Aligner ou choisir les pistes audio et sous-titres par défaut sur Plex"
              @click="openAlignModal('movie')"
            >
              <SlidersHorizontal :size="15" />
              <span>Aligner les pistes</span>
            </button>
            <VfUpgradeButton
              v-if="admin && sourceType && sourceId"
              :source-type="sourceType"
              :source-id="sourceId"
              scope="movie"
              :media-title="mediaTitle"
              label="Rechercher"
            />
          </div>
        </div>
        <div v-if="movieSubtitleAlerts" class="subtitle-alerts">
          <MediaSubtitleAlerts :alerts="movieSubtitleAlerts" context="movie" />
        </div>
        <MediaTrackGroup v-if="vfDetail.tracks?.length" class="track-group" title="Audio" :tracks="vfDetail.tracks" fallback-label="Audio" highlight-fr />
        <p v-if="!vfDetail.tracks?.length" class="empty track-empty">Aucune piste audio detectee.</p>
        <MediaTrackGroup v-if="vfDetail.subtitles?.length" title="Sous-titres" :tracks="vfDetail.subtitles" fallback-label="Sous-titre" />
      </div>
    </div>
    <p v-else-if="envelopeError" class="notice error-text">Échec du chargement de l'analyse VF.</p>
    <p v-else class="empty">Chargement de l'analyse VF...</p>

    <!-- Modale commune d'alignement des pistes Plex -->
    <AlignStreamsModal
      :open="alignModalOpen"
      :item="alignModalItem"
      :initial-scope="alignInitialScope"
      :initial-season-number="alignSeasonNumber"
      :initial-episode-number="alignEpisodeNumber"
      @close="alignModalOpen = false"
      @applied="onStreamsAligned"
    />
  </div>
</template>

<script setup lang="ts">
import UiTooltip from '@/components/ui/UiTooltip.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { computed, ref } from "vue";
import { MessageSquareWarning, SlidersHorizontal } from "@lucide/vue";
import VfUpgradeButton from "@/components/media/VfUpgradeButton.vue";
import SeasonEpisodeList from "@/components/media/SeasonEpisodeList.vue";
import AlignStreamsModal from "@/components/media/AlignStreamsModal.vue";
import MediaEpisodeRow from "@/components/media/MediaEpisodeRow.vue";
import MediaStreamsDetail from "@/components/media/MediaStreamsDetail.vue";
import MediaSubtitleAlerts from "@/components/media/MediaSubtitleAlerts.vue";
import MediaTrackGroup from "@/components/media/MediaTrackGroup.vue";
import {
  episodeStatusClass,
  episodeStatusLabel,
  seasonHeading,
  seasonSubtitleAlerts,
  subtitleAlerts,
} from '@/utils/mediaStreams';

const props = withDefaults(
  defineProps<{
    vfDetail?: any;
    envelopeError?: boolean;
    availabilityError?: boolean;
    vfStatusError?: boolean;
    sourceType?: 'library_item' | 'request' | string | null;
    sourceId?: number | null;
    admin?: boolean;
    mediaTitle?: string;
    missingOnly?: boolean;
  }>(),
  {
    vfDetail: null,
    envelopeError: false,
    availabilityError: false,
    vfStatusError: false,
    sourceType: null,
    sourceId: null,
    admin: false,
    mediaTitle: '',
    missingOnly: false,
  }
);

const emit = defineEmits<{
  (e: 'correction', scope: string, seasonNumber: number | null, episodeNumber: number | null): void;
  (e: 'expand-season', seasonNumber: number): void;
  (e: 'aligned', payload: any): void;
}>();

const movieSubtitleAlerts = computed(() => {
  if (!props.vfDetail || props.vfDetail.media_type !== 'movie') return null;
  return subtitleAlerts(props.vfDetail.tracks || [], props.vfDetail.subtitles || []);
});

const alignModalOpen = ref(false);
const alignInitialScope = ref<'series' | 'season' | 'episode' | 'selection'>('selection');
const alignSeasonNumber = ref<number | null>(null);
const alignEpisodeNumber = ref<number | null>(null);

const alignModalItem = computed(() => {
  if (!props.sourceId) return null;
  return {
    id: props.sourceId,
    source_type: props.sourceType === 'requests' ? 'request' : props.sourceType,
    media_type: props.vfDetail?.media_type || (displayedSeasons.value.length ? 'show' : 'movie'),
    title: props.mediaTitle || 'Média',
  };
});

function openAlignModal(
  scope: 'movie' | 'series' | 'season' | 'episode',
  seasonNum: number | null = null,
  epNum: number | null = null
) {
  alignInitialScope.value = scope === 'movie' ? 'selection' : scope;
  alignSeasonNumber.value = seasonNum;
  alignEpisodeNumber.value = epNum;
  alignModalOpen.value = true;
}

function onStreamsAligned(payload: any) {
  emit('aligned', payload);
  if (alignSeasonNumber.value != null) {
    emit('expand-season', alignSeasonNumber.value);
  }
}

const displayedSeasons = computed(() => {
  const seasons = props.vfDetail?.seasons || [];
  const filtered = props.missingOnly ? seasons.filter((season: any) => (season.counts?.absent || 0) > 0) : seasons;
  // Repliees par defaut (voir SeasonEpisodeList) : la fiche media deroulait toutes les
  // saisons d'emblee, meme sur une longue serie -- l'utilisateur deplie au clic.
  return filtered.map((season: any) => ({ ...season, open: season.open ?? false }));
});
function episodeDisplayFilter(ep: any): boolean {
  return props.missingOnly ? ep.status === 'absent' : true;
}

const expandedEpisode = ref<string | null>(null);
function episodeKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}-${episodeNumber}`;
}
function toggleEpisode(seasonNumber: number, episodeNumber: number): void {
  const key = episodeKey(seasonNumber, episodeNumber);
  expandedEpisode.value = expandedEpisode.value === key ? null : key;
}
function isEpisodeExpanded(seasonNumber: number, episodeNumber: number): boolean {
  return expandedEpisode.value === episodeKey(seasonNumber, episodeNumber);
}
</script>

<style scoped lang="scss">
.season-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  list-style: none;
}
.season-badges {
  gap: 4px;
}
.episode-status-btn {
  cursor: pointer;
}
.track-group {
  margin-bottom: 0.5rem;
}
.track-empty {
  margin-bottom: 0.5rem;
}
.subtitle-alerts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 0.75rem;
}

.show-audio-head {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-3);
}

.movie-audio-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.movie-audio-head h2 {
  margin: 0;
}

.movie-audio-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-align-streams {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: var(--fs-sm);
  font-weight: 500;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
  transition: background-color var(--motion-duration-fast) var(--motion-ease-standard), border-color var(--motion-duration-fast) var(--motion-ease-standard), color var(--motion-duration-fast) var(--motion-ease-standard), box-shadow var(--motion-duration-fast) var(--motion-ease-standard), opacity var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard);

  &:hover {
    background: var(--surface-hover);
    border-color: var(--accent);
    color: var(--accent);
  }
}
</style>
