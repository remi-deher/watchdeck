<template>
  <MediaPosterCollection
    mode="rail"
    :title="title"
    :more-to="moreTo"
    :clickable="clickable"
    :loading="loading"
    :empty="!items.length"
    empty-message="Aucun média."
    :size="size"
    :aria-label="`${title}, ${items.length} médias`"
    @title-click="$emit('title-click')"
  >
    <LibraryCard
      v-for="item in items"
      :key="item.id"
      :item="item"
      view="grid"
      :can-moderate="false"
      :busy="false"
      :selected="false"
      @open="$emit('open', item)"
    />
  </MediaPosterCollection>
</template>

<script setup lang="ts">
import MediaPosterCollection from '@/components/media/MediaPosterCollection.vue';
import LibraryCard from './LibraryCard.vue';

withDefaults(
  defineProps<{
    title: string;
    items?: any[];
    loading?: boolean;
    moreTo?: string | Record<string, any> | null;
    clickable?: boolean;
    size?: 'standard' | 'compact' | 'music';
  }>(),
  {
    items: () => [],
    loading: false,
    moreTo: null,
    clickable: false,
    size: 'standard',
  }
);

defineEmits<{
  (e: 'open', item: any): void;
  (e: 'title-click'): void;
}>();
</script>
