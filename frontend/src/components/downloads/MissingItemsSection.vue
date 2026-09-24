<template>
  <!-- Ce qui devrait etre la et ne l'est pas : episodes regroupes par serie, films seuls. -->
  <section class="panel wanted-section" role="tabpanel">
    <div class="panel-head">
      <div>
        <h3>Éléments manquants</h3>
        <p>Cliquez sur un élément pour ouvrir sa fiche dans Bibliothèque et gérer son suivi.</p>
      </div>
      <span class="badge">{{ itemCount }} item(s)</span>
    </div>
    <div v-if="items.length" class="media-grid missing-items-grid" aria-label="Éléments manquants">
      <MissingSeriesCard
        v-for="series in mediaType === 'radarr' ? [] : seriesGroups"
        :key="`series-${series.instance_id}-${series.arr_id}`"
        :series="series"
        @error="emit('error', $event)"
      />
      <LibraryCard
        v-for="item in mediaType === 'sonarr' ? [] : movies"
        :key="`wanted-${item.instance_id}-${item.id}`"
        :item="libraryItem(item)"
        @error="emit('error', $event)"
      />
    </div>
    <p v-else-if="!loading" class="empty">Aucun élément manquant signalé.</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LibraryCard from '@/components/library/LibraryCard.vue';
import MissingSeriesCard from './MissingSeriesCard.vue';

const props = defineProps<{
  items: any[];
  /** `radarr`, `sonarr`, ou vide pour les deux. */
  mediaType: string;
  loading: boolean;
}>();
const emit = defineEmits<{ (e: 'error', message: string): void }>();

const seriesGroups = computed(() => {
  const groups = new Map<string, any>();
  for (const episode of props.items.filter((item: any) => item.arr_type === 'sonarr')) {
    const key = `${episode.instance_id}:${episode.arr_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        arr_id: episode.arr_id,
        instance_id: episode.instance_id,
        instance_name: episode.instance_name,
        title: episode.series_title || episode.title,
        poster_url: episode.poster_url,
        media_type: 'show',
        episodes: [],
      });
    }
    groups.get(key).episodes.push(episode);
  }
  return [...groups.values()].map(series => ({
    ...series,
    episodes: series.episodes.sort((a: any, b: any) => (a.season_number - b.season_number) || (a.episode_index - b.episode_index)),
  })).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
});
const movies = computed(() => props.items.filter((row: any) => row.arr_type !== 'sonarr'));
const itemCount = computed(() => {
  if (props.mediaType === 'sonarr') return seriesGroups.value.length;
  if (props.mediaType === 'radarr') return movies.value.length;
  return seriesGroups.value.length + movies.value.length;
});

// Un film manquant s'affiche comme une demande orpheline de la bibliotheque.
function libraryItem(item: any) {
  return {
    ...item,
    _kind: 'request',
    orphan: true,
    orphan_source: item.arr_type,
    arr_instance_id: item.instance_id,
    status: 'sent_to_arr',
    title: item.episode_number ? `${item.title} · ${item.episode_number}` : item.title,
  };
}
</script>

<style scoped>
.wanted-section{display:grid;gap:var(--space-3);padding:16px}
.missing-items-grid{margin-top:var(--space-4)}
</style>
