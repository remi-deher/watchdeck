<template>
  <MediaRail
    title="Récemment disponibles"
    eyebrow="Bibliothèque"
    empty-message="Aucun média disponible récemment."
    more-to="/library?status=library&sort=added_desc"
    aria-label="Médias récemment disponibles dans Plex"
    :items="items"
    :item-to="recentDetailPath"
    item-action-label="Voir la fiche"
  />
</template>

<script setup lang="ts">
import { mediaDetailPath } from '@/mediaUrl';
import MediaRail from '@/components/discover/MediaRail.vue';

export interface RecentlyAvailableItem {
  id: number | string;
  library_id?: number | string;
  request_id?: number | string;
  title: string;
  poster_url?: string;
  media_type?: string;
  available_at?: string;
}

withDefaults(
  defineProps<{
    items?: RecentlyAvailableItem[];
  }>(),
  {
    items: () => [],
  }
);

function recentDetailPath(item: RecentlyAvailableItem): string {
  if (item.library_id) return mediaDetailPath({ library_id: item.library_id }, 'library');
  return mediaDetailPath({ request_id: item.request_id || item.id }, 'request');
}
</script>
