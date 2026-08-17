<template>
  <MediaGrid
    v-if="mode === 'grid'"
    v-bind="$attrs"
    :items="items"
    :loading="loading"
    :loading-more="loadingMore"
    :has-more="hasMore"
    :error="error"
    :empty="empty"
    :empty-message="emptyMessage"
    :loading-message="loadingMessage"
    :variant="resolvedVariant"
    @load-more="$emit('load-more')"
    @retry="$emit('retry')"
  >
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps || {}" />
    </template>
  </MediaGrid>

  <HorizontalRail
    v-else
    v-bind="$attrs"
    :title="title"
    :eyebrow="eyebrow"
    :more-to="moreTo"
    :clickable="clickable"
    :aria-label="ariaLabel"
    :loading="loading"
    :error="error"
    :empty="resolvedEmpty"
    :empty-message="emptyMessage"
    :variant="resolvedVariant"
    @retry="$emit('retry')"
    @title-click="$emit('title-click')"
  >
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps || {}" />
    </template>
  </HorizontalRail>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MediaGrid from '@/components/ui/MediaGrid.vue';
import HorizontalRail from '@/components/ui/HorizontalRail.vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  mode?: 'grid' | 'rail';
  size?: 'standard' | 'compact' | 'music';
  items?: any[] | null;
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  error?: string;
  empty?: boolean | null;
  emptyMessage?: string;
  loadingMessage?: string;
  title?: string;
  eyebrow?: string;
  moreTo?: string | Record<string, any> | null;
  clickable?: boolean;
  ariaLabel?: string;
}>(), {
  mode: 'grid',
  size: 'standard',
  items: null,
  loading: false,
  loadingMore: false,
  hasMore: false,
  error: '',
  empty: null,
  emptyMessage: 'Aucun média à afficher.',
  loadingMessage: 'Chargement du catalogue…',
  title: '',
  eyebrow: '',
  moreTo: null,
  clickable: false,
  ariaLabel: '',
});

defineEmits<{
  (e: 'load-more'): void;
  (e: 'retry'): void;
  (e: 'title-click'): void;
}>();

const resolvedVariant = computed(() => props.size === 'standard' ? 'poster' : props.size);
const resolvedEmpty = computed(() => props.empty ?? (props.items !== null && props.items.length === 0));
</script>
