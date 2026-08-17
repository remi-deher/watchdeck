<template>
  <MediaCardShell
    class="catalog-card discover-card"
    :is-music="isMusic"
    :has-action="requestable || !!actionLabel || !!$slots.action"
    :animated="animated"
    :bordered="bordered"
    :elevate-on-hover="elevateOnHover"
  >
    <template #default="{ revealed, reveal }">
      <component
        :is="to ? RouterLink : 'div'"
        v-bind="linkAttributes"
        :aria-label="accessibleLabel"
        class="poster-link catalog-poster-link discover-poster-link"
        @pointerdown="rememberPointerState($event, revealed)"
        @click="handleActivate($event, revealed, reveal)"
        @keydown.enter="handleKeyboardActivate"
        @keydown.space="handleKeyboardActivate"
      >
        <MediaPoster :poster-url="item.poster_url" :is-music="isMusic" :alt="`Affiche de ${title}`">
          <template #badges>
            <div class="poster-badges catalog-status-badge">
              <slot name="badges"><MediaStatusBadge :item="item" /></slot>
            </div>
          </template>
          <template #overlay>
            <div class="poster-overlay catalog-card-overlay discover-card-overlay">
              <div class="poster-copy">
                <slot name="meta">
                  <div class="poster-meta">
                    <span v-if="item.year">{{ item.year }}</span>
                    <span>{{ mediaTypeLabel(item.media_type) }}</span>
                    <span v-if="rating" class="poster-rating"><Star aria-hidden="true" />{{ rating }}</span>
                  </div>
                </slot>
                <slot name="title"><strong>{{ title }}</strong></slot>
              </div>
            </div>
          </template>
        </MediaPoster>
      </component>
    </template>

    <template #action>
      <slot name="action">
        <button
          v-if="requestable"
          type="button"
          class="poster-action request-action"
          :disabled="requestBusy"
          :aria-label="`Demander ${title}`"
          @click="$emit('request', item)"
        >
          <Download aria-hidden="true" />{{ requestBusy ? 'Envoi…' : 'Demander' }}
        </button>
        <RouterLink
          v-else-if="actionLabel && to"
          :to="resolvedTo"
          class="poster-action nav-action"
          :aria-label="actionLabel + ' : ' + title"
          @click.stop
        >{{ actionLabel }}</RouterLink>
      </slot>
    </template>
  </MediaCardShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { Download, Star } from '@lucide/vue';
import { mediaTypeLabel } from '@/utils/labels';
import MediaCardShell from './MediaCardShell.vue';
import MediaPoster from './MediaPoster.vue';
import MediaStatusBadge from './MediaStatusBadge.vue';

const props = withDefaults(
  defineProps<{
    item: any;
    to?: string | Record<string, any> | null;
    actionLabel?: string;
    requestable?: boolean;
    requestBusy?: boolean;
    bordered?: boolean;
    animated?: boolean;
    elevateOnHover?: boolean;
  }>(),
  {
    to: null,
    actionLabel: '',
    requestable: false,
    requestBusy: false,
    bordered: false,
    animated: true,
    elevateOnHover: true,
  }
);

const emit = defineEmits<{
  (e: 'request', item: any): void;
  (e: 'open', item: any): void;
}>();

const isMusic = computed(() => ['artist', 'album', 'track'].includes(props.item.media_type));
const title = computed(() => props.item.title || props.item.name || 'Sans titre');
const rating = computed(() => {
  const value = Number(props.item.vote_average || props.item.vote || 0);
  return value > 0 ? value.toFixed(1) : '';
});
const accessibleLabel = computed(() => [
  title.value,
  mediaTypeLabel(props.item.media_type),
  props.item.year,
].filter(Boolean).join(', '));
const linkAttributes = computed(() => props.to
  ? { to: props.to }
  : { role: 'link', tabindex: 0 });
const resolvedTo = computed(() => props.to || '/');
const pointerStartedRevealed = ref(false);
const pointerWasCoarse = ref(false);

function rememberPointerState(e: PointerEvent, revealed: boolean): void {
  pointerStartedRevealed.value = revealed;
  pointerWasCoarse.value = e.pointerType === 'touch'
    || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);
}

function handleActivate(e: MouseEvent, revealed: boolean, reveal: () => void): void {
  const needsReveal = pointerWasCoarse.value ? !pointerStartedRevealed.value : !revealed;
  pointerWasCoarse.value = false;
  if (needsReveal) {
    e.preventDefault();
    e.stopPropagation();
    reveal();
    return;
  }
  if (!props.to) emit('open', props.item);
}

function handleKeyboardActivate(e: KeyboardEvent): void {
  if (!props.to) {
    e.preventDefault();
    emit('open', props.item);
  }
}
</script>

<style scoped lang="scss">
.poster-action {
  background: var(--accent);
  color: #111;
}
.poster-action svg { width: 15px; height: 15px; }
.request-action {
  width: calc(100% - 18px);
  border: 1px solid color-mix(in srgb, var(--accent) 75%, #fff);
  cursor: pointer;
}
</style>
