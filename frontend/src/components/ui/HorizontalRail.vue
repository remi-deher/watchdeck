<template>
  <section class="horizontal-rail-section" :class="[variant && `variant-${variant}`]" :aria-busy="loading">
    <header v-if="$slots.header || title || eyebrow" class="rail-header">
      <slot name="header">
        <div class="rail-heading">
          <span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
          <RouterLink v-if="moreTo" :to="moreTo" class="rail-title">
            <span>{{ title }}</span>
            <ArrowRight aria-hidden="true" />
          </RouterLink>
          <button v-else-if="clickable" type="button" class="rail-title as-button" @click="$emit('title-click')">
            <span>{{ title }}</span>
            <ArrowRight aria-hidden="true" />
          </button>
          <component :is="headingTag" v-else-if="title" class="rail-title">
            {{ title }}
          </component>
        </div>
        <div v-if="$slots['header-extra']" class="rail-header-extra">
          <slot name="header-extra" />
        </div>
      </slot>
    </header>

    <!-- Chargement -->
    <slot v-if="loading" name="skeleton">
      <UiFeedback type="loading" message="Chargement…" />
    </slot>

    <!-- Erreur -->
    <UiFeedback v-else-if="error" type="error" :message="error" retry @retry="$emit('retry')" />

    <!-- Contenu scrollable -->
    <div v-else-if="!empty" class="horizontal-rail-shell">
      <div
        ref="track"
        class="rail-track"
        :class="[trackClass, variant && `track-${variant}`]"
        role="region"
        tabindex="0"
        :aria-describedby="railHintId"
        @keydown="onKeydown"
        :aria-label="ariaLabel || (title ? `${title}` : 'Contenu défilant')"
      >
        <slot />
      </div>
      <span :id="railHintId" class="sr-only">Utilisez les flèches gauche et droite pour parcourir ce contenu.</span>
      <RailEdgeControls :can-left="railState.canLeft" :can-right="railState.canRight" @scroll="scroll" />
    </div>

    <!-- État vide -->
    <slot v-else name="empty">
      <UiEmptyState :message="emptyMessage" />
    </slot>
  </section>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue';
import { ArrowRight } from '@lucide/vue';
import { useHorizontalRail } from '@/composables/useHorizontalRail';
import RailEdgeControls from '@/components/ui/RailEdgeControls.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

withDefaults(
  defineProps<{
    title?: string;
    eyebrow?: string;
    headingTag?: string;
    moreTo?: string | Record<string, any> | null;
    clickable?: boolean;
    ariaLabel?: string;
    loading?: boolean;
    error?: string;
    empty?: boolean;
    emptyMessage?: string;
    trackClass?: string;
    variant?: 'poster' | 'compact' | 'music' | 'cast' | string;
  }>(),
  {
    title: '',
    eyebrow: '',
    headingTag: 'h2',
    moreTo: null,
    clickable: false,
    ariaLabel: '',
    loading: false,
    error: '',
    empty: false,
    emptyMessage: 'Aucun média à afficher.',
    trackClass: '',
    variant: 'poster',
  }
);

defineEmits<{
  (e: 'retry'): void;
  (e: 'title-click'): void;
}>();

const track = ref<HTMLElement | null>(null);
const railHintId = useId();
const { state: railState, scroll, onKeydown } = useHorizontalRail(track);

defineExpose({
  track,
  scroll,
  railState,
});
</script>

<style scoped lang="scss">
.horizontal-rail-section {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}

.rail-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-4);
}

.rail-heading {
  display: grid;
  gap: 3px;
}

.rail-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin: 0;
  color: inherit;
  font-size: var(--fs-lg);
  font-weight: 750;
  line-height: 1.2;
  text-decoration: none;
}

a.rail-title svg,
button.rail-title svg {
  width: 18px;
  height: 18px;
  color: var(--accent);
  transition: transform .18s ease;
}

a.rail-title:hover,
button.rail-title:hover {
  color: var(--accent);
}

a.rail-title:hover svg,
button.rail-title:hover svg {
  transform: translateX(3px);
}

a.rail-title:focus-visible,
button.rail-title:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 5px;
  border-radius: var(--radius-xs);
}

button.rail-title.as-button {
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  font-weight: inherit;
  cursor: pointer;
}

.rail-header-extra {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.horizontal-rail-shell {
  position: relative;
  min-width: 0;
}

.rail-track {
  display: grid;
  grid-auto-flow: column;
  gap: var(--space-4);
  padding: 8px 8px 14px;
  margin: -6px -8px -10px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
  overscroll-behavior-inline: contain;
}

.rail-track > :deep(*) { content-visibility: auto; contain-intrinsic-size: 220px 330px; scroll-snap-align: start; }

.rail-track::-webkit-scrollbar {
  display: none;
}

/* Variantes de largeur de colonnes */
.track-poster {
  grid-auto-columns: clamp(var(--poster-rail-min), var(--poster-rail-fluid), var(--poster-rail-max));
  gap: var(--poster-grid-gap);
}

.track-compact {
  grid-auto-columns: minmax(140px, 160px);
  gap: var(--space-3);
}

.track-music {
  grid-auto-columns: clamp(140px, 16vw, 180px);
  gap: var(--space-3);
}

.track-cast {
  grid-auto-columns: minmax(118px, 145px);
  gap: var(--space-3);
}

@media (max-width: 767.98px) {
  .track-poster {
    grid-auto-columns: minmax(var(--poster-rail-min), var(--poster-rail-fluid));
    margin-right: -12px;
  }
  .track-compact {
    grid-auto-columns: 130px;
  }
  .track-music {
    grid-auto-columns: minmax(130px, 42vw);
    margin-right: -12px;
  }
  .track-cast {
    grid-auto-columns: 108px;
  }
}
</style>
