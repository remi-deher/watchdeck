<template>
  <MediaPosterCollection
    mode="rail"
    :title="title"
    :eyebrow="eyebrow"
    :more-to="moreTo"
    :loading="loading"
    :error="error"
    :empty="!items.length"
    :empty-message="emptyMessage"
    size="standard"
    :aria-label="ariaLabel || `${title}, ${items.length} médias`"
    @retry="$emit('retry')"
  >
    <template #skeleton>
      <MediaRailSkeleton />
    </template>
    <MediaPosterCard
      v-for="(item, index) in items"
      :key="`${item.media_type}:${item.tmdb_id || item.id}`"
      :item="item"
      :style="{ '--card-index': index }"
      :to="resolveItemPath(item)"
      :action-label="resolveActionLabel(item)"
      :requestable="allowRequest && canRequest(item)"
      :request-busy="requesting.includes(itemKey(item))"
      @request="$emit('request', $event)"
    />
  </MediaPosterCollection>
</template>

<script setup lang="ts">
import { mediaDetailPath } from '@/mediaUrl';
import MediaPosterCollection from '@/components/media/MediaPosterCollection.vue';
import MediaPosterCard from '@/components/media/MediaPosterCard.vue';
import MediaRailSkeleton from './MediaRailSkeleton.vue';

const props = withDefaults(
  defineProps<{
    title: string;
    eyebrow?: string;
    items?: any[];
    loading?: boolean;
    error?: string;
    moreTo?: string | Record<string, any>;
    emptyMessage?: string;
    ariaLabel?: string;
    itemTo?: string | Record<string, any> | ((item: any) => string | Record<string, any>);
    itemActionLabel?: string | ((item: any) => string);
    allowRequest?: boolean;
    requesting?: string[];
  }>(),
  {
    eyebrow: '',
    items: () => [],
    loading: false,
    error: '',
    moreTo: '',
    emptyMessage: 'Aucun média à afficher.',
    ariaLabel: '',
    itemTo: '',
    itemActionLabel: '',
    allowRequest: false,
    requesting: () => [],
  }
);

defineEmits<{
  (e: 'retry'): void;
  (e: 'request', item: any): void;
}>();

function defaultItemPath(item: any): string {
  const kind = item.library_id ? 'library' : item.request_id ? 'request' : 'discover';
  return mediaDetailPath(item, kind, { discover: true });
}
function defaultActionLabel(item: any): string {
  if (item.in_library || item.library_id) return 'Voir la fiche';
  if (item.requested || item.request_id) return 'Suivre la demande';
  return 'Demander';
}
function resolveItemPath(item: any): string | Record<string, any> {
  if (typeof props.itemTo === 'function') return props.itemTo(item);
  return props.itemTo || defaultItemPath(item);
}
function resolveActionLabel(item: any): string {
  if (typeof props.itemActionLabel === 'function') return props.itemActionLabel(item);
  return props.itemActionLabel || defaultActionLabel(item);
}
function itemKey(item: any): string {
  return `${item.media_type}:${item.tmdb_id || item.id}`;
}
function canRequest(item: any): boolean {
  return !item.in_library && !item.library_id && !item.requested && !item.request_id;
}
</script>
