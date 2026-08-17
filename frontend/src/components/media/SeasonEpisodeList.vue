<template>
  <div class="se-list">
    <template v-for="season in seasons" :key="season.key ?? season.season_number ?? season.seasonNumber">
      <!-- Saison avec épisodes : bloc dépliable -->
      <details
        v-if="hasEpisodes(season)"
        class="se-season season-group"
        :class="{ 'has-pending': season.hasPending || (season.counts?.pending > 0) }"
        :open="season.open ?? true"
        @toggle="onToggle(season, $event)"
      >
        <summary class="se-season-summary season-summary">
          <slot name="season-header" :season="season" :episodes="filteredEpisodes(season)">
            <span class="season-title">Saison {{ season.season_number ?? season.seasonNumber }}</span>
          </slot>
        </summary>

        <div v-if="season.loading" class="se-season-loading">{{ loadingText }}</div>
        <p v-else-if="season.error" class="se-season-error">{{ errorText }}</p>
        <div v-else class="se-episode-list season-content">
          <template v-for="(episode, idx) in filteredEpisodes(season)" :key="episode.id ?? episode.episode_number ?? episode.episode ?? idx">
            <slot name="episode" :season="season" :episode="episode">
              <div class="se-episode-default-row">{{ episode.episode_number ?? episode.episode }}. {{ episode.title }}</div>
            </slot>
          </template>
          <p v-if="!filteredEpisodes(season).length" class="se-empty">{{ emptyText }}</p>
        </div>
      </details>

      <!-- Saison sans détail épisode (ex: choix de saisons avant ajout à la bibliothèque) -->
      <div v-else class="se-season-only">
        <slot name="season-header" :season="season" :episodes="[]">
          <strong>Saison {{ season.season_number ?? season.seasonNumber }}</strong>
        </slot>
      </div>
    </template>
    <p v-if="!seasons.length" class="se-empty">{{ emptyText }}</p>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    seasons: any[];
    episodeFilter?: (episode: any, season: any) => boolean;
    loadingText?: string;
    errorText?: string;
    emptyText?: string;
  }>(),
  {
    episodeFilter: () => () => true,
    loadingText: 'Chargement des épisodes…',
    errorText: 'Échec du chargement de cette saison.',
    emptyText: 'Aucun épisode.',
  }
);

const emit = defineEmits<{
  (e: 'expand-season', seasonNumber: number): void;
}>();

function hasEpisodes(season: any): boolean {
  return Array.isArray(season.episodes) || Array.isArray(season.items);
}

function filteredEpisodes(season: any): any[] {
  const list = Array.isArray(season.episodes) ? season.episodes : (Array.isArray(season.items) ? season.items : []);
  return list.filter((ep: any) => props.episodeFilter(ep, season));
}

function onToggle(season: any, event: Event): void {
  const num = season.season_number ?? season.seasonNumber;
  if ((event.target as HTMLDetailsElement).open && num != null) emit('expand-season', num);
}
</script>

<style scoped lang="scss">
.se-season {
  display: block;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.se-season-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  list-style: none;
  gap: var(--space-2);
}
.se-season-loading {
  padding: 0.5rem 0;
  color: var(--muted);
  font-size: var(--fs-md);
}
.se-season-error {
  margin: 0;
  color: var(--danger, #f87171);
}
.se-episode-list {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  padding-left: 0.5rem;
  border-left: 2px solid var(--border);
}
.se-episode-default-row {
  padding: 4px 0;
  font-size: var(--fs-sm);
}
.se-season-only {
  margin-bottom: 4px;
}
.se-empty {
  color: var(--muted);
  font-size: var(--fs-sm);
}
</style>
