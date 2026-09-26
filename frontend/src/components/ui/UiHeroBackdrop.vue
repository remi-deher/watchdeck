<template>
  <div
    class="ui-hero-backdrop theme-dark-scope"
    :class="[`is-${variant}`, { 'is-zoomable': zoomOnHover }]"
    :style="rootStyle"
  >
    <div class="ui-hero-backdrop__image" :style="imageStyle" />
    <div class="ui-hero-backdrop__scrim" />
    <div class="ui-hero-backdrop__overlay">
      <slot name="overlay" />
    </div>
    <div class="ui-hero-backdrop__content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    imageUrl?: string | null;
    position?: string;
    minHeight?: string;
    variant?: 'card' | 'sheet';
    zoomOnHover?: boolean;
  }>(),
  {
    imageUrl: null,
    position: 'center 20%',
    minHeight: undefined,
    variant: 'card',
    zoomOnHover: false,
  }
);

const rootStyle = computed(() => (props.minHeight ? { minHeight: props.minHeight } : undefined));
const imageStyle = computed(() => ({
  backgroundImage: props.imageUrl ? `url("${props.imageUrl}")` : undefined,
  backgroundPosition: props.position,
}));
</script>

<style scoped lang="scss">
.ui-hero-backdrop {
  --hero-scrim-strong: rgba(9, 9, 11, 0.98);
  --hero-scrim-medium: rgba(9, 9, 11, 0.65);
  --hero-scrim-light: rgba(9, 9, 11, 0.15);
  --hero-scrim-side-strong: rgba(9, 9, 11, 0.88);
  --hero-scrim-side-medium: rgba(9, 9, 11, 0.4);

  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: clamp(300px, 42vw, 460px);
  overflow: hidden;
  background: var(--surface);
}

.ui-hero-backdrop.is-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.ui-hero-backdrop__image,
.ui-hero-backdrop__scrim,
.ui-hero-backdrop__overlay {
  position: absolute;
  inset: 0;
}

.ui-hero-backdrop__image {
  background-size: cover;
  background-color: var(--surface);
}

.ui-hero-backdrop__scrim {
  background:
    linear-gradient(to top, var(--hero-scrim-strong) 0%, var(--hero-scrim-medium) 45%, var(--hero-scrim-light) 100%),
    linear-gradient(to right, var(--hero-scrim-side-strong) 0%, var(--hero-scrim-side-medium) 50%, transparent 80%);
  pointer-events: none;
}

.ui-hero-backdrop.is-sheet .ui-hero-backdrop__scrim {
  background:
    linear-gradient(to top, var(--bg) 0%, var(--hero-scrim-medium) 45%, var(--hero-scrim-light) 100%),
    linear-gradient(to right, var(--hero-scrim-side-strong) 0%, var(--hero-scrim-side-medium) 50%, transparent 80%);
}

.ui-hero-backdrop__overlay {
  z-index: 2;
  pointer-events: none;
}

.ui-hero-backdrop__overlay :deep(*) {
  pointer-events: auto;
}

.ui-hero-backdrop__content {
  position: relative;
  z-index: 1;
  width: 100%;
}

.ui-hero-backdrop.is-zoomable .ui-hero-backdrop__image {
  transform: scale(1.02);
  transition: transform 5s cubic-bezier(0.25, 1, 0.5, 1);
  will-change: transform;
}

@media (hover: hover) and (pointer: fine) {
  .ui-hero-backdrop.is-zoomable:hover .ui-hero-backdrop__image {
    transform: scale(1.05);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-hero-backdrop.is-zoomable .ui-hero-backdrop__image {
    transform: none;
    transition: none;
  }
}
</style>
