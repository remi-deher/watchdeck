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
              <strong>Saison {{ season.season_number }}{{ season.name && !/^(saison|season)\s*\d+$/i.test(season.name) ? ` — ${season.name}` : '' }}</strong>
              <div class="inline-row compact season-badges">
                <span class="badge available" v-if="season.counts?.vf">VF: {{ season.counts.vf }}</span>
                <span class="badge" v-if="season.counts?.vo">VO: {{ season.counts.vo }}</span>
                <span class="badge language-tag vf-secondary" v-if="season.counts?.vf_secondary">VF (sec.): {{ season.counts.vf_secondary }}</span>
                <span class="badge danger" v-if="season.counts?.absent">Absent: {{ season.counts.absent }}</span>
                <span class="badge pending_approval" v-if="season.counts?.tba">TBA: {{ season.counts.tba }}</span>
                <span class="badge" v-if="season.episode_count">{{ season.episode_count }} ep.</span>
                <!-- Badges sous-titre saison -->
                <span v-if="season.counts?.sub_fr_no_track" class="badge" style="background:var(--color-text-muted,#888);color:#fff" title="Épisodes sans aucune piste de sous-titre (possiblement hardcoded dans le flux vidéo)">ST hardcoded(?): {{ season.counts.sub_fr_no_track }}</span>
                <span v-if="season.counts?.sub_fr_absent" class="badge danger" title="Épisodes non-francophones sans sous-titre FR complet">Sub FR absent: {{ season.counts.sub_fr_absent }}</span>
                <span v-if="season.counts?.sub_fr_not_default" class="badge pending" title="Épisodes avec sous-titre FR complet non activé par défaut">Sub FR non activé: {{ season.counts.sub_fr_not_default }}</span>
                <span v-if="season.counts?.forced_fr_not_default" class="badge language-tag vf-secondary" title="Épisodes francophones avec sous-titre forcé FR (sign/trad) non activé par défaut">Forcé FR non activé: {{ season.counts.forced_fr_not_default }}</span>
                <button
                  v-if="admin && sourceId"
                  class="icon-button"
                  @click.prevent.stop="openAlignModal('season', season.season_number)"
                  title="Aligner les pistes de cette saison sur Plex"
                  aria-label="Aligner la saison"
                >
                  <SlidersHorizontal :size="15" />
                </button>
                <VfUpgradeButton
                  v-if="admin && sourceType && sourceId"
                  :source-type="sourceType"
                  :source-id="sourceId"
                  scope="season"
                  :season-number="season.season_number"
                  :media-title="mediaTitle"
                  label="Rechercher"
                />
                <button class="icon-button" @click.prevent="$emit('correction', 'season', season.season_number, null)" title="Corriger Saison" aria-label="Corriger Saison"><MessageSquareWarning :size="16" /></button>
              </div>
            </div>
          </template>

          <template #episode="{ season, episode: ep }">
            <div class="episode-row" @click="toggleEpisode(season.season_number, ep.episode)">
              <div class="episode-main">
                <img
                  v-if="ep.still_url"
                  :src="ep.still_url"
                  alt=""
                  class="episode-still"
                >
                <div v-else class="episode-still"></div>
                <div class="episode-body">
                  <div class="episode-title-row">
                    <strong class="episode-title">{{ ep.episode }}. {{ ep.title || `Episode ${ep.episode}` }}</strong>
                    <span class="episode-actions">
                      <span v-if="ep.isKnownEpisode === false" class="badge pending" title="Non reconnu par Sonarr/TheTVDB : compté hors statut VF/VO/Mixte de la série">Hors TVDB</span>
                      <button
                        v-if="admin && sourceId && ep.isKnownEpisode !== false && ep.status !== 'tba'"
                        class="icon-button"
                        @click.prevent.stop="openAlignModal('episode', season.season_number, ep.episode)"
                        title="Aligner les pistes de cet épisode sur Plex"
                        aria-label="Aligner l'épisode"
                      >
                        <SlidersHorizontal :size="14" />
                      </button>
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
                        :class="{'available': ep.status === 'vf', 'language-tag vf-secondary': ep.status === 'vf_secondary', 'danger': ep.status === 'absent', 'pending_approval': ep.status === 'tba', 'pending': ep.status === 'unknown'}"
                        @click.stop="ep.status !== 'unknown' && $emit('correction', 'episode', season.season_number, ep.episode)"
                        :title="ep.status === 'unknown' ? 'Chargement...' : 'Signaler une correction'"
                      >
                        {{ episodeStatusLabel(ep.status) }}
                      </button>
                    </span>
                  </div>
                  <p v-if="formatAirDate(ep.air_date)" class="episode-air-date">{{ formatAirDate(ep.air_date) }}</p>
                  <p v-if="ep.overview" class="episode-overview">{{ ep.overview }}</p>
                </div>
              </div>
              <div v-if="isEpisodeExpanded(season.season_number, ep.episode)" class="episode-detail" @click.stop>
                <div class="episode-detail-line">
                  <span class="episode-detail-label">Langues audio</span>
                  <span v-if="ep.tracks?.length" class="episode-detail-value">
                    <span v-for="(track, i) in ep.tracks" :key="`t-${i}`" class="badge" :class="track.is_fr ? 'available' : ''">
                      {{ track.label }}{{ track.is_default ? ' (par défaut)' : '' }}
                    </span>
                  </span>
                  <span v-else class="episode-detail-empty">Aucune piste audio detectee.</span>
                </div>
                <div class="episode-detail-line">
                  <span class="episode-detail-label">Sous-titres</span>
                  <span v-if="ep.subtitles?.length" class="episode-detail-value">
                    <span v-for="(sub, i) in ep.subtitles" :key="`s-${i}`" class="badge" :class="sub.is_fr && sub.is_forced ? 'language-tag vf-secondary' : sub.is_fr ? 'available' : ''">
                      {{ sub.label }}{{ sub.is_forced ? ' (forcé)' : '' }}{{ sub.is_default ? ' (par défaut)' : '' }}
                    </span>
                  </span>
                  <span v-else class="episode-detail-empty">Aucun sous-titre detecte.</span>
                </div>
                <!-- Alertes sous-titre épisode (uniquement si les pistes sont connues) -->
                <div v-if="ep.tracks?.length || ep.subtitles?.length" class="episode-detail-line episode-sub-alerts">
                  <span class="episode-detail-label">Alertes</span>
                  <span class="episode-detail-value">
                    <template v-if="!subtitleAlerts(ep.tracks, ep.subtitles).subFrNoTrack && !subtitleAlerts(ep.tracks, ep.subtitles).subFrAbsent && !subtitleAlerts(ep.tracks, ep.subtitles).subFrNotDefault && !subtitleAlerts(ep.tracks, ep.subtitles).forcedFrNotDefault">
                      <span class="badge available">Sous-titres OK</span>
                    </template>
                    <span v-if="subtitleAlerts(ep.tracks, ep.subtitles).subFrNoTrack" class="badge" style="background:var(--color-text-muted,#888);color:#fff" title="Aucune piste de sous-titre détectée — possiblement hardcoded dans le flux vidéo">ST possiblement hardcoded</span>
                    <span v-if="subtitleAlerts(ep.tracks, ep.subtitles).subFrAbsent" class="badge danger" title="Pas de sous-titre français complet pour cet épisode non-francophone">Sous-titre FR absent</span>
                    <span v-if="subtitleAlerts(ep.tracks, ep.subtitles).subFrNotDefault" class="badge pending" title="Sous-titre FR complet présent mais non activé par défaut">Sous-titre FR non activé</span>
                    <span v-if="subtitleAlerts(ep.tracks, ep.subtitles).forcedFrNotDefault" class="badge language-tag vf-secondary" title="Sous-titre FR sign/traduction présent mais non activé par défaut">Forcé FR non activé</span>
                  </span>
                </div>
              </div>
            </div>
          </template>
        </SeasonEpisodeList>
        <p v-if="!displayedSeasons.length" class="empty">{{ missingOnly ? 'Aucun épisode manquant.' : 'Aucun détail de saison disponible.' }}</p>
        <p v-if="availabilityError" class="notice error-text">Disponibilite (Sonarr) indisponible pour l'instant.</p>
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
        <!-- Badges sous-titre film -->
        <div v-if="movieSubtitleAlerts" class="subtitle-alerts">
          <span v-if="movieSubtitleAlerts.subFrNoTrack" class="badge subtitle-alert-badge" style="background:var(--color-text-muted,#888);color:#fff" title="Aucune piste de sous-titre détectée — possiblement hardcoded dans le flux vidéo">ST possiblement hardcoded</span>
          <span v-if="movieSubtitleAlerts.subFrAbsent" class="badge danger subtitle-alert-badge" title="Ce film non-francophone n'a pas de sous-titre français complet">Sous-titre FR absent</span>
          <span v-if="movieSubtitleAlerts.subFrNotDefault" class="badge pending subtitle-alert-badge" title="Un sous-titre français complet est présent mais non activé par défaut">Sous-titre FR non activé</span>
          <span v-if="movieSubtitleAlerts.forcedFrNotDefault" class="badge language-tag vf-secondary subtitle-alert-badge" title="Un sous-titre FR sign/traduction est présent mais non activé par défaut">Sous-titre forcé FR non activé</span>
        </div>
        <details class="season-details track-group" v-if="vfDetail.tracks?.length">
          <summary class="track-group-summary">
            <span>Audio ({{ vfDetail.tracks.length }})</span>
            <ChevronDown :size="16" />
          </summary>
          <div class="track-group-body">
            <article v-for="(track, index) in vfDetail.tracks" :key="'audio-'+index" class="detail-row track-row">
              <div>
                <strong>{{ track.lang ? track.lang.toUpperCase() : 'Inconnu' }} <span v-if="track.is_default" class="track-default-tag">(Par défaut)</span></strong>
                <span>{{ track.label || 'Audio' }}</span>
              </div>
              <span class="badge" :class="track.is_fr ? 'available' : ''">{{ track.lang ? track.lang.toUpperCase() : '??' }}</span>
            </article>
          </div>
        </details>
        <p v-if="!vfDetail.tracks?.length" class="empty track-empty">Aucune piste audio detectee.</p>

        <details class="season-details" v-if="vfDetail.subtitles?.length">
          <summary class="track-group-summary">
            <span>Sous-titres ({{ vfDetail.subtitles.length }})</span>
            <ChevronDown :size="16" />
          </summary>
          <div class="track-group-body">
            <article v-for="(sub, index) in vfDetail.subtitles" :key="'sub-'+index" class="detail-row track-row">
              <div>
                <strong>{{ sub.lang ? sub.lang.toUpperCase() : 'Inconnu' }} <span v-if="sub.is_default" class="track-default-tag">(Par défaut)</span></strong>
                <span>{{ sub.label || 'Sous-titre' }}</span>
              </div>
              <span class="badge">{{ sub.lang ? sub.lang.toUpperCase() : '??' }}</span>
            </article>
          </div>
        </details>
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
import { computed, ref } from "vue";
import { MessageSquareWarning, ChevronDown, SlidersHorizontal } from "@lucide/vue";
import VfUpgradeButton from "@/components/media/VfUpgradeButton.vue";
import SeasonEpisodeList from "@/components/media/SeasonEpisodeList.vue";
import AlignStreamsModal from "@/components/media/AlignStreamsModal.vue";

export interface SubtitleAlertsResult {
  subFrNoTrack: boolean;
  subFrAbsent: boolean;
  subFrNotDefault: boolean;
  forcedFrNotDefault: boolean;
}

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

function subtitleAlerts(tracks: any[] = [], subtitles: any[] = []): SubtitleAlertsResult {
  const isFrancophone = tracks.some((t) => t.is_fr);
  const fullFrSubs = subtitles.filter((s) => s.is_fr && !s.is_forced);
  const forcedFrSubs = subtitles.filter((s) => s.is_fr && s.is_forced);

  if (!isFrancophone) {
    const hasAnyTrack = subtitles.length > 0;
    const hasFullFr = fullFrSubs.length > 0;
    const fullFrIsDefault = fullFrSubs.some((s) => s.is_default);
    return {
      subFrNoTrack: !hasAnyTrack,
      subFrAbsent: hasAnyTrack && !hasFullFr,
      subFrNotDefault: hasFullFr && !fullFrIsDefault,
      forcedFrNotDefault: false,
    };
  }
  return {
    subFrNoTrack: false,
    subFrAbsent: false,
    subFrNotDefault: false,
    forcedFrNotDefault: forcedFrSubs.length > 0 && !forcedFrSubs.some((s) => s.is_default),
  };
}

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

const EPISODE_STATUS_LABELS: Record<string, string> = { vf: 'VF', vf_secondary: 'VF (sec.)', vo: 'VO', absent: 'ABSENT', tba: 'TBA', unknown: '…' };
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
function episodeStatusLabel(status: string): string {
  return EPISODE_STATUS_LABELS[status] || status.toUpperCase();
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

function formatAirDate(airDate: string): string {
  if (!airDate) return '';
  const hasTime = airDate.includes('T');
  const d = new Date(airDate);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!hasTime) return datePart;
  const timePart = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} a ${timePart}`;
}
</script>

<style scoped lang="scss">
.movie-audio-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: 0.75rem;
}
.movie-audio-head h2 {
  margin: 0;
}
.season-block {
  display: block;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
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
.season-loading {
  padding: 0.5rem 0;
  color: var(--muted);
  font-size: var(--fs-md);
}
.episode-list {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  padding-left: 0.5rem;
  border-left: 2px solid var(--border);
}
.episode-main {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}
.episode-still {
  flex-shrink: 0;
  width: 120px;
  height: 68px;
  object-fit: cover;
  border-radius: var(--radius-xs);
  background: var(--surface-hover);
}
.episode-body {
  flex: 1;
  min-width: 0;
}
.episode-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.episode-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.episode-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}
.episode-status-btn {
  cursor: pointer;
}
.episode-air-date {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
.episode-overview {
  display: -webkit-box;
  overflow: hidden;
  margin: 4px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.track-group {
  margin-bottom: 0.5rem;
}
.track-group-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  border-radius: var(--radius-sm);
  background: var(--surface-hover);
  font-weight: 500;
  cursor: pointer;
}
.track-group-body {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  padding-left: 0.5rem;
  border-left: 2px solid var(--border);
}
.track-row {
  margin-bottom: 6px;
}
.track-default-tag {
  opacity: 0.8;
  font-weight: normal;
  font-size: var(--fs-sm);
}
.track-empty {
  margin-bottom: 0.5rem;
}
.episode-row {
  margin-bottom: 10px;
  padding: 6px;
  border-radius: var(--radius-xs);
  cursor: pointer;
}
.episode-row:hover {
  background: var(--surface-hover);
}
.episode-detail {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 10px;
  border-left: 2px solid var(--accent);
  border-radius: var(--radius-xs);
  background: rgba(0, 0, 0, .2);
  cursor: default;
}
.episode-detail-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
}
.episode-detail-label {
  flex: 0 0 auto;
  min-width: 90px;
  color: var(--muted);
  font-weight: 600;
}
.episode-detail-value {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.episode-detail-empty {
  color: var(--muted);
}
.subtitle-alerts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 0.75rem;
}
.episode-sub-alerts {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
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
  gap: var(--space-3);
  margin-bottom: var(--space-3);
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
  transition: all 0.2s ease;

  &:hover {
    background: var(--surface-hover);
    border-color: var(--accent);
    color: var(--accent);
  }
}
</style>
