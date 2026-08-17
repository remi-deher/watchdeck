<template>
  <MediaRail
    title="Prochaines sorties"
    eyebrow="Sorties"
    empty-message="Aucune sortie à venir."
    more-to="/calendar"
    aria-label="Prochaines sorties cinéma et séries"
    :items="items"
    item-to="/calendar"
    :item-action-label="upcomingActionLabel"
  />
</template>

<script setup lang="ts">
import { formatReleaseDate as formatUpcomingDate } from '@/utils/format';
import MediaRail from '@/components/discover/MediaRail.vue';

export interface UpcomingReleaseItem {
  id: number | string;
  title: string;
  poster_url?: string;
  media_type?: string;
  label?: string;
  release_date?: string;
}

withDefaults(
  defineProps<{
    items?: UpcomingReleaseItem[];
  }>(),
  {
    items: () => [],
  }
);

function upcomingActionLabel(item: UpcomingReleaseItem): string {
  return item.release_date ? formatUpcomingDate(item.release_date) : 'Voir au calendrier';
}
</script>
