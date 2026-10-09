<template>
  <!-- Ce qui devrait etre la et ne l'est pas, onglet des Demandes reserve aux admins :
       episodes regroupes par serie, films seuls, dans la carte commune des affiches. -->
  <div class="missing-panel">
    <div class="missing-panel__head">
      <UiSegmentedControl v-model="kind" :options="kindOptions" ariaLabel="Type de média manquant" />
      <p class="missing-panel__count" aria-live="polite">{{ cards.length }} {{ cards.length > 1 ? 'éléments' : 'élément' }}</p>
    </div>

    <UiFeedback v-if="query.isError.value" type="error" title="Impossible de charger les éléments manquants" :message="query.error.value?.message" retry @retry="query.refetch()" />
    <UiFeedback v-else-if="query.isPending.value" type="loading" message="Chargement des éléments manquants…" />
    <section v-else-if="cards.length" v-list-motion class="media-grid library-grid" aria-label="Éléments manquants">
      <MediaPosterCard
        v-for="card in cards"
        :key="card.key"
        class="interactive"
        :item="card"
        bordered
        @open="open(card)"
      >
        <template #badges>
          <span class="badge pending">{{ card.badge }}</span>
        </template>
        <template #meta>
          <div class="poster-meta">
            <span v-if="card.year">{{ card.year }}</span>
            <span>{{ card.instance_name }}</span>
          </div>
        </template>
        <template #action>
          <span class="poster-action nav-action" aria-hidden="true">Voir la fiche</span>
        </template>
      </MediaPosterCard>
    </section>
    <UiEmptyState v-else title="Rien ne manque" message="Sonarr et Radarr ne signalent aucun élément manquant." />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { useToast } from '@/composables/useToast';
import { mediaDetailPath } from '@/mediaUrl';
import MediaPosterCard from '@/components/media/MediaPosterCard.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';

interface MissingCard {
  key: string;
  source: 'sonarr' | 'radarr';
  instance_id: string | number;
  instance_name?: string;
  arr_id: string | number;
  title: string;
  year?: number | null;
  poster_url?: string | null;
  media_type: string;
  badge: string;
}

const kindOptions = [
  { value: 'all', label: 'Tout' },
  { value: 'movie', label: 'Films' },
  { value: 'show', label: 'Séries' },
];
const kind = ref('all');

const route = useRoute();
const router = useRouter();
const { addToast } = useToast();

const query = useQuery({
  queryKey: ['arr', 'wanted', '', ''] as const,
  queryFn: ({ signal }) => api<any[]>('/api/arr/wanted', { signal }),
  select: (rows) => (Array.isArray(rows) ? rows : []),
});

/* Une serie par carte, avec son nombre d'episodes manquants ; puis les films. */
const allCards = computed<MissingCard[]>(() => {
  const rows = query.data.value || [];
  const series = new Map<string, MissingCard & { episodes: number }>();
  const movies: MissingCard[] = [];
  for (const row of rows) {
    if (row.arr_type === 'sonarr') {
      const key = `show-${row.instance_id}-${row.arr_id}`;
      const current = series.get(key);
      if (current) current.episodes += 1;
      else series.set(key, {
        key, source: 'sonarr', instance_id: row.instance_id, instance_name: row.instance_name, arr_id: row.arr_id,
        title: row.series_title || row.title, poster_url: row.poster_url, media_type: 'show', badge: '', episodes: 1,
      });
    } else {
      movies.push({
        key: `movie-${row.instance_id}-${row.id}`, source: 'radarr', instance_id: row.instance_id, instance_name: row.instance_name,
        arr_id: row.arr_id ?? row.id, title: row.title, year: row.year, poster_url: row.poster_url, media_type: 'movie', badge: 'Manquant',
      });
    }
  }
  const shows = [...series.values()].map(({ episodes, ...card }) => ({ ...card, badge: `${episodes} épisode${episodes > 1 ? 's' : ''}` }));
  const byTitle = (a: MissingCard, b: MissingCard) => a.title.localeCompare(b.title, 'fr');
  return [...shows.sort(byTitle), ...movies.sort(byTitle)];
});
const cards = computed(() => (kind.value === 'all' ? allCards.value : allCards.value.filter((card) => card.media_type === kind.value)));

const opening = ref(false);
async function open(card: MissingCard): Promise<void> {
  if (opening.value) return;
  opening.value = true;
  try {
    const { library_item_id } = await api<{ library_item_id: number | string }>(
      `/api/requests/orphans/${card.source}/${card.instance_id}/${card.arr_id}/open`,
      { method: 'POST' },
    );
    ouvrirFiche(router, mediaDetailPath({ library_id: library_item_id }, 'library'), route.fullPath);
  } catch (error: any) {
    addToast({ type: 'error', message: error?.message || 'Impossible d’ouvrir la fiche' });
  } finally {
    opening.value = false;
  }
}
</script>

<style scoped lang="scss">
.missing-panel { display: grid; gap: var(--space-3); }
.missing-panel__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.missing-panel__count { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
