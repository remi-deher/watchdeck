<template>
  <div v-if="loading && !items.length" class="vf-skeletons" aria-hidden="true">
    <div v-for="i in 3" :key="`skel-audit-${i}`" class="vf-skeleton-card">
      <div class="skeleton-poster" />
      <div class="skeleton-body">
        <div class="skeleton-line title" />
        <div class="skeleton-line sub" />
        <div class="skeleton-line row" />
      </div>
    </div>
  </div>

  <section v-else class="audit-list">
    <article
      v-for="item in items"
      :key="`audit-${item.id}`"
      class="audit-card"
      :class="{ 'is-expanded': isAuditShowExpanded(item.id) }"
    >
      <div class="audit-card-top">
        <!-- Zone 1 : Affiche & Titre -->
        <div class="card-media-col">
          <div class="poster-wrap">
            <img
              v-if="item.poster_url && !failedPosters.has(`audit-${item.id}`)"
              :src="item.poster_url"
              :alt="`Affiche de ${item.title}`"
              class="media-poster"
              loading="lazy"
              decoding="async"
              @error="failedPosters.add(`audit-${item.id}`)"
            >
            <div v-else class="media-poster placeholder">
              <Film v-if="item.media_type === 'movie'" :size="24" />
              <Tv v-else :size="24" />
            </div>
          </div>

          <div class="media-identity">
            <div class="media-badges">
              <span class="badge" :class="item.media_type === 'movie' ? 'badge-movie' : 'badge-show'">
                {{ item.media_type === 'movie' ? 'Film' : 'Série' }}
              </span>
              <span v-if="item.year" class="badge badge-year">{{ item.year }}</span>
            </div>
            <RouterLink class="media-title" :to="`/library/media/library/${item.id}`">
              {{ item.title || 'Média sans titre' }}
            </RouterLink>
          </div>
        </div>

        <!-- Zone 2 : Matrice de diagnostic Audio / Sous-titres -->
        <div class="card-diag-col">
          <!-- Ligne Audio FR -->
          <div class="diag-row" :class="audioRowClass(item)">
            <Volume2 v-if="item.has_vf" :size="15" />
            <VolumeX v-else :size="15" />
            <span class="diag-label">Audio FR :</span>
            <strong class="diag-status">{{ audioStatusLabel(item) }}</strong>
          </div>

          <!-- Ligne Sous-titres FR -->
          <div class="diag-row" :class="subtitleRowClass(item)">
            <MessageSquare v-if="item.sub_fr_status !== 'absent'" :size="15" />
            <MessageSquareOff v-else :size="15" />
            <span class="diag-label">Sous-titres :</span>
            <strong class="diag-status">{{ subtitleStatusLabel(item.sub_fr_status) }}</strong>
          </div>

          <!-- Ligne Sous-titres forcés (si VF présente) -->
          <div v-if="item.has_vf" class="diag-row" :class="forcedRowClass(item)">
            <span class="diag-icon-dot" />
            <span class="diag-label">ST Forcés :</span>
            <strong class="diag-status">{{ forcedStatusLabel(item.forced_fr_status) }}</strong>
          </div>
        </div>

        <!-- Zone 3 : Actions principales contextuelles -->
        <div class="card-action-col">
          <button
            v-if="item.media_type === 'show'"
            class="secondary compact"
            type="button"
            :title="isAuditShowExpanded(item.id) ? 'Masquer les saisons' : 'Voir les saisons et épisodes'"
            @click="toggleAuditShow(item)"
          >
            <ChevronUp v-if="isAuditShowExpanded(item.id)" :size="14" />
            <ChevronDown v-else :size="14" />
            <span>{{ isAuditShowExpanded(item.id) ? 'Masquer' : 'Saisons & Épisodes' }}</span>
          </button>

          <button
            v-if="canFixStreams(item)"
            class="primary compact"
            type="button"
            :disabled="fixingAll"
            title="Prévisualiser et aligner les flux audio et sous-titres sur Plex"
            @click="emit('align', item)"
          >
            <SlidersHorizontal :size="14" />
            <span>Aligner sur Plex</span>
          </button>

          <VfUpgradeButton
            source-type="library_item"
            :source-id="item.id"
            :scope="item.media_type === 'movie' ? 'movie' : 'season'"
            :media-title="item.title"
            label="Chercher VF"
            @updated="emit('refresh')"
          />

          <RouterLink class="button secondary compact" :to="`/library/media/library/${item.id}`">
            Fiche
          </RouterLink>
        </div>
      </div>

      <!-- Zone Saisons & Épisodes pour les séries -->
      <div v-if="item.media_type === 'show' && isAuditShowExpanded(item.id)" class="audit-show-episodes-wrap">
        <div v-if="getAuditShowLoading(item.id)" class="audit-episodes-loading">
          <RotateCcw :size="15" class="spin" />
          <span>Chargement des saisons et épisodes…</span>
        </div>
        <div v-else-if="getAuditShowError(item.id)" class="notice error-text">
          <span>Impossible de charger les détails de cette série.</span>
        </div>
        <SeasonEpisodeList
          v-else-if="getAuditShowSeasons(item.id).length"
          class="show-seasons-list"
          :seasons="getAuditShowSeasons(item.id)"
          @expand-season="(sNum) => loadAuditShowSeason(item.id, sNum)"
        >
          <template #season-header="{ season }">
            <span class="season-title">Saison {{ season.season_number }}</span>
            <span class="season-badge-count">
              {{ season.episode_count || (season.episodes || []).length }} épisodes
            </span>
            <div class="season-status-summary">
              <span v-if="season.counts?.vf" class="badge available">VF: {{ season.counts.vf }}</span>
              <span v-if="season.counts?.vo" class="badge">VO: {{ season.counts.vo }}</span>
              <span v-if="season.counts?.vf_secondary" class="badge language-tag vf-secondary">VF (sec.): {{ season.counts.vf_secondary }}</span>
              <span v-if="season.counts?.sub_fr_not_default" class="badge pending">ST inactif: {{ season.counts.sub_fr_not_default }}</span>
              <span v-if="season.counts?.forced_fr_not_default" class="badge language-tag vf-secondary">Forcé inactif: {{ season.counts.forced_fr_not_default }}</span>
              <span v-if="season.counts?.sub_fr_absent" class="badge danger">ST absent: {{ season.counts.sub_fr_absent }}</span>
              <VfUpgradeButton
                source-type="library_item"
                :source-id="item.id"
                scope="season"
                :season-number="season.season_number"
                :media-title="item.title"
                label="Chercher VF"
                @updated="emit('refresh')"
              />
            </div>
          </template>

          <template #episode="{ season, episode: ep }">
            <div class="audit-episode-row">
              <div class="audit-episode-main">
                <strong class="audit-episode-title">{{ ep.episode }}. {{ ep.title || `Épisode ${ep.episode}` }}</strong>
                <div class="audit-episode-badges">
                  <span
                    class="badge"
                    :class="{
                      'available': ep.status === 'vf',
                      'language-tag vf-secondary': ep.status === 'vf_secondary',
                      'muted': ep.status === 'vo',
                      'danger': ep.status === 'absent',
                    }"
                  >
                    {{ ep.status === 'vf' ? 'VF' : ep.status === 'vf_secondary' ? 'VF secondaire' : ep.status === 'vo' ? 'VO' : ep.status }}
                  </span>
                  <span v-if="ep.has_forced_fr_sub && !ep.forced_fr_sub_is_default" class="badge language-tag vf-secondary" title="Sous-titre forcé FR non activé par défaut">
                    Forcé non activé
                  </span>
                  <span v-if="ep.has_full_fr_sub && !ep.full_fr_sub_is_default" class="badge pending" title="Sous-titre complet FR non activé par défaut">
                    ST non activé
                  </span>
                  <span v-if="ep.has_any_sub_track === false" class="badge danger" title="Aucune piste de sous-titre détectée">
                    ST absent
                  </span>
                </div>
              </div>
              <div class="audit-episode-actions">
                <VfUpgradeButton
                  source-type="library_item"
                  :source-id="item.id"
                  scope="episode"
                  :season-number="season.season_number"
                  :episode-number="ep.episode"
                  :media-title="item.title"
                  label="Chercher VF"
                  @updated="emit('refresh')"
                />
              </div>
            </div>
          </template>
        </SeasonEpisodeList>
        <p v-else class="empty">Aucun détail de saison disponible.</p>
      </div>
    </article>

    <p v-if="!loading && !items.length" class="empty">
      Aucun média ne correspond aux filtres d'audit sélectionnés.
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown, ChevronUp, Film, MessageSquare, MessageSquareOff, RotateCcw, SlidersHorizontal, Tv, Volume2, VolumeX } from '@lucide/vue';
import VfUpgradeButton from '@/components/media/VfUpgradeButton.vue';
import SeasonEpisodeList from '@/components/media/SeasonEpisodeList.vue';
import { useAuditShowDetails } from '@/composables/vf/useAuditShowDetails';
import type { AuditItem } from '@/composables/vf/types';
import {
  audioRowClass, audioStatusLabel, canFixStreams, forcedRowClass, forcedStatusLabel, subtitleRowClass, subtitleStatusLabel,
} from '@/utils/vfUpgradeLabels';

/**
 * Onglet « Alignement des pistes » : un media audite par carte, son diagnostic audio /
 * sous-titres et ses actions. Les saisons des series se chargent a la demande et
 * restent propres a ce panneau.
 */
defineProps<{
  /** Medias affiches, filtres deja appliques. */
  items: AuditItem[];
  loading: boolean;
  /** « Tout aligner » en cours : les alignements unitaires attendent. */
  fixingAll: boolean;
}>();
const emit = defineEmits<{
  /** Ouvrir la previsualisation d'alignement de ce media. */
  align: [item: AuditItem];
  /** Une recherche VF a abouti : relire l'audit. */
  refresh: [];
}>();

const {
  isExpanded: isAuditShowExpanded, isLoading: getAuditShowLoading, hasError: getAuditShowError,
  seasonsOf: getAuditShowSeasons, loadSeason: loadAuditShowSeason, toggle,
} = useAuditShowDetails();
const toggleAuditShow = (item: AuditItem) => toggle(item.id);
const failedPosters = ref(new Set<string>());
</script>

<style scoped lang="scss">
@use './vfShared' as *;

.audit-list {
  display: grid;
  gap: var(--space-3);
}

/* Listes */
.audit-list {
  display: grid;
  gap: var(--space-3);
}

/* Cartes Audit épurées à 3 zones */
.audit-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 14px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: border-color 0.15s ease;
}

.audit-card:hover {
  border-color: var(--border-hover, var(--border));
}

.audit-card-top {
  display: grid;
  grid-template-columns: 280px 1fr auto;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
}

.audit-show-episodes-wrap {
  width: 100%;
  padding-top: var(--space-3);
  border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.audit-episodes-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  color: var(--muted);
  font-size: var(--fs-sm);
}

.audit-episode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: var(--surface-2);
  border-radius: var(--radius-xs);
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.audit-episode-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}

.audit-episode-title {
  font-size: var(--fs-xs);
  color: var(--text);
  white-space: nowrap;
}

.audit-episode-badges {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.audit-episode-actions {
  flex-shrink: 0;
}

.card-media-col {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.poster-wrap {
  flex-shrink: 0;
  width: 58px;
  aspect-ratio: 2 / 3;
}

.media-poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.media-poster.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  border: 1px dashed var(--border);
}

.media-identity {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.media-badges {
  display: flex;
  align-items: center;
  gap: 5px;
}

.badge-year {
  color: var(--muted);
  font-size: var(--fs-xs);
}

/* Zone 2 : Matrice de diagnostic */
.card-diag-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 14px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.diag-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-xs);
}

.diag-label {
  color: var(--muted);
  font-weight: 550;
  min-width: 85px;
}

.diag-status {
  font-weight: 650;
  color: var(--text);
}

.diag-icon-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  margin: 0 4px;
}

.diag-row.is-ok {
  color: var(--green-text, #22c55e);
}

.diag-row.is-warning {
  color: #fde047;
}

.diag-row.is-danger {
  color: #fca5a5;
}

.diag-row.is-muted {
  color: var(--muted);
}

/* Zone 3 : Actions */
.card-action-col {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.card-action-col button.compact,
.card-action-col a.compact {
  min-height: 32px;
  padding: 0 12px;
  font-size: var(--fs-xs);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

/* Les variantes compactes descendent a 30-32px : acceptable a la souris, sous le
   minimum tactile d'iOS et de Material des qu'il n'y a plus de curseur. */
@media (pointer: coarse) {
  .card-action-col button.compact,
  .card-action-col a.compact {
    min-height: var(--touch-target);
    padding-inline: 14px;
  }
}

@media (max-width: 900px) {
  .audit-card {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
  .card-action-col {
    justify-content: flex-start;
  }
}

@media (max-width: 767.98px) {
  .audit-card { padding: 12px; }
  .audit-card-top { gap: var(--space-3); }
  .audit-episode-row { align-items: stretch; flex-direction: column; }
  .audit-episode-actions { width: 100%; }
  .audit-episode-actions :deep(button) { width: 100%; min-height: 44px; }
}
</style>
