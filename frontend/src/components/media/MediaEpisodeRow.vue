<template>
  <div class="media-episode-row" @click="$emit('toggle')">
    <div class="media-episode-row__main">
      <img v-if="still" :src="still" alt="" class="media-episode-row__still">
      <div v-else class="media-episode-row__still"></div>
      <div class="media-episode-row__body">
        <div class="media-episode-row__title-row">
          <strong class="media-episode-row__title">{{ number }}. {{ title || `Episode ${number}` }}</strong>
          <span class="media-episode-row__actions">
            <slot name="actions" />
          </span>
        </div>
        <p v-if="airDateText" class="media-episode-row__air-date">{{ airDateText }}</p>
        <p v-if="overview" class="media-episode-row__overview">{{ overview }}</p>
      </div>
    </div>
    <slot v-if="expanded" />
  </div>
</template>

<script setup lang="ts">
/* Ligne d'un episode dans une liste de saison : vignette, numero et titre, actions a
   droite, date de diffusion, resume ; un clic deplie le detail (emplacement par defaut). */
import { computed } from 'vue';
import { formatAirDate } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    number: number | string;
    title?: string | null;
    still?: string | null;
    airDate?: string | null;
    overview?: string | null;
    expanded?: boolean;
  }>(),
  { title: null, still: null, airDate: null, overview: null, expanded: false }
);

defineEmits<{
  (e: 'toggle'): void;
}>();

const airDateText = computed(() => formatAirDate(props.airDate));
</script>

<style scoped lang="scss">
.media-episode-row {
  margin-bottom: 10px;
  padding: 6px;
  border-radius: var(--radius-xs);
  cursor: pointer;
}
.media-episode-row:hover {
  background: var(--surface-hover);
}
.media-episode-row__main {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}
.media-episode-row__still {
  flex-shrink: 0;
  width: 120px;
  height: 68px;
  object-fit: cover;
  border-radius: var(--radius-xs);
  background: var(--surface-hover);
}
.media-episode-row__body {
  flex: 1;
  min-width: 0;
}
.media-episode-row__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.media-episode-row__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-episode-row__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}
.media-episode-row__air-date {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
.media-episode-row__overview {
  display: -webkit-box;
  overflow: hidden;
  margin: 4px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
