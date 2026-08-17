<template>
  <section v-if="items.length" class="drawer-section">
    <HorizontalRail
      :title="title"
      heading-tag="h3"
      variant="compact"
    >
      <MediaPosterCard
        v-for="item in items.slice(0, 15)"
        :key="`${item.media_type}:${item.tmdb_id}`"
        :item="item"
        :to="detailPath(item)"
        :action-label="cardActionLabel(item)"
        :requestable="allowRequest && canRequest(item)"
        :request-busy="requesting.includes(mediaKey(item))"
        @request="$emit('request', item)"
      />
    </HorizontalRail>
  </section>
</template>

<script setup lang="ts">
import HorizontalRail from '@/components/ui/HorizontalRail.vue';
import MediaPosterCard from '@/components/media/MediaPosterCard.vue';
import { mediaDetailPath } from '@/mediaUrl';

withDefaults(
  defineProps<{
    items?: any[];
    title?: string;
    allowRequest?: boolean;
    requesting?: string[];
  }>(),
  {
    items: () => [],
    title: 'Recommandations',
    allowRequest: true,
    requesting: () => [],
  }
);

defineEmits<{
  (e: 'open', item: any): void;
  (e: 'request', item: any): void;
}>();

function detailPath(item: any): string {
  return mediaDetailPath(item, item.library_id ? 'library' : item.request_id ? 'request' : 'discover', { discover: true });
}

function cardActionLabel(item: any): string {
  if (item.in_library || item.library_id) return 'Voir la fiche';
  if (item.requested || item.request_id) return 'Suivre la demande';
  return 'Demander';
}

function canRequest(item: any): boolean {
  return !item.in_library && !item.library_id && !item.requested && !item.request_id;
}

function mediaKey(item: any): string {
  return `${item.media_type}:${item.tmdb_id || item.id}`;
}
</script>
