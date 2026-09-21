<template>
  <MediaCardShell
    class="catalog-card discover-card"
    :is-music="isMusic"
    :has-action="requestable || !!actionLabel || !!$slots.action"
    :animated="animated"
    :bordered="bordered"
    :elevate-on-hover="elevateOnHover"
  >
    <template #default>
      <component
        :is="to ? RouterLink : 'div'"
        v-bind="linkAttributes"
        :aria-label="accessibleLabel"
        class="poster-link catalog-poster-link discover-poster-link"
        @click="handleActivate"
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
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { Download, Star } from '@lucide/vue';
import { mediaTypeLabel } from '@/utils/labels';
import MediaCardShell from './MediaCardShell.vue';
import MediaPoster from './MediaPoster.vue';
import MediaStatusBadge from './MediaStatusBadge.vue';
import {
  posterElementFrom,
  prefersReducedMotion,
  supportsViewTransitions,
  withPosterTransition,
} from '@/composables/useViewTransition';

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

const router = useRouter();

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

/**
 * Le premier appui sur une carte encore fermee ne parvient jamais jusqu'ici :
 * `MediaCardShell` l'intercepte en capture pour decouvrir titre et action. Ce
 * gestionnaire ne voit donc que les activations d'une carte deja ouverte.
 */
/* La navigation passe par une transition de vue quand le navigateur sait la faire :
   l'affiche touchee est transportee jusqu'a l'en-tete de la fiche, au lieu de disparaitre
   avec l'ecran. On intercepte donc le lien plutot que de le laisser naviguer seul -- sans
   quoi la navigation a deja eu lieu quand la transition demarre, et il n'y a plus rien a
   photographier. Sans support, `withPosterTransition` se contente de naviguer. */
function handleActivate(event?: MouseEvent | KeyboardEvent): void {
  if (!props.to) {
    emit('open', props.item);
    return;
  }
  if (!supportsViewTransitions() || prefersReducedMotion()) return;
  // Les clics enrichis (nouvel onglet, telechargement) restent au navigateur.
  const souris = event as MouseEvent | undefined;
  if (souris && (souris.metaKey || souris.ctrlKey || souris.shiftKey || souris.altKey || souris.button > 0)) return;
  event?.preventDefault();
  void withPosterTransition(posterElementFrom(event?.target ?? null), async () => {
    await router.push(props.to as any);
  });
}

function handleKeyboardActivate(e: KeyboardEvent): void {
  if (!props.to) {
    e.preventDefault();
    emit('open', props.item);
    return;
  }
  handleActivate(e);
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
