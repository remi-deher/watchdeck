<template>
  <article
    class="media-card poster-card"
    :class="{ 'is-music': isMusic, bordered, animated, elevated: elevateOnHover, 'has-action': hasAction }"
    :style="hasAction && actionPadding ? { '--card-action-padding': actionPadding } : undefined"
  >
    <div
      class="poster-wrap"
      :class="{ revealed, 'has-action': hasAction }"
      @mouseenter="revealed = true"
      @mouseleave="revealed = false"
      @focusin="revealed = true"
      @focusout="revealed = false"
    >
      <slot :revealed="revealed" :reveal="() => (revealed = true)" />
      <slot name="action" :revealed="revealed" />
    </div>
  </article>
</template>

<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
  defineProps<{
    isMusic?: boolean;
    hasAction?: boolean;
    actionPadding?: string;
    animated?: boolean;
    bordered?: boolean;
    elevateOnHover?: boolean;
  }>(),
  {
    isMusic: false,
    hasAction: false,
    actionPadding: '58px',
    animated: false,
    bordered: false,
    elevateOnHover: false,
  }
);

const revealed = ref(false);
</script>

<style scoped lang="scss">
@keyframes card-reveal {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.poster-card {
  position: relative;
  min-width: 0;
  aspect-ratio: 2 / 3;
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius-md);
  isolation: isolate;
  transform: translateZ(0);
  -webkit-mask-image: -webkit-radial-gradient(white, black);
  background: var(--surface-2);
  color: inherit;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.poster-card.is-music { aspect-ratio: 1 / 1; }
.poster-card.bordered { border: 1px solid var(--border); }
.poster-card.animated {
  animation: card-reveal 0.32s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: calc(min(var(--card-index, 0), 16) * 24ms);
  will-change: transform, opacity;
}
.poster-card:hover,
.poster-card:focus-within {
  border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
  box-shadow: 0 16px 34px rgba(0, 0, 0, .42);
  transform: translateY(-4px) scale(1.015);
}
.poster-card.elevated:hover,
.poster-card.elevated:focus-within {
  z-index: 5;
}

@media (prefers-reduced-motion: reduce) {
  .poster-card.animated {
    animation: none;
  }
}
.poster-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0 !important;
  border-radius: inherit;
  overflow: hidden;
}
.poster-wrap :deep(.poster-link) {
  display: block;
  height: 100%;
  color: inherit;
  text-decoration: none;
  border-radius: inherit;
  outline: none;
}
.poster-wrap :deep(.poster-link:focus-visible) {
  outline: none;
}
.poster-wrap :deep(.poster-shell) {
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
  border-radius: inherit;
}
.poster-wrap :deep(.poster-shell > img),
.poster-wrap :deep(.poster-fallback) {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  aspect-ratio: auto;
  object-fit: cover;
  border-radius: inherit;
}
.poster-wrap :deep(.poster-fallback) { display: grid; }
.poster-wrap :deep(.poster-badges) {
  position: absolute;
  top: 7px;
  left: 7px;
  right: 7px;
  display: flex;
  padding: 0;
  pointer-events: none;
}
.poster-wrap :deep(.poster-overlay) {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  padding: 70px 12px 12px;
  background: linear-gradient(180deg, transparent 20%, rgba(8, 10, 14, .18) 43%, rgba(8, 10, 14, .96) 100%);
  color: #fff;
  opacity: 0;
  pointer-events: none;
  border-radius: inherit;
  transition: opacity .18s ease;
}
.poster-wrap:hover :deep(.poster-overlay),
.poster-wrap:focus-within :deep(.poster-overlay),
.poster-wrap.revealed :deep(.poster-overlay) { opacity: 1; pointer-events: auto; }
.poster-wrap :deep(.poster-copy) { display: grid; gap: var(--space-1); width: 100%; min-width: 0; padding: 0 !important; }
.poster-wrap :deep(.poster-copy > strong) {
  display: -webkit-box;
  overflow: hidden;
  color: #fff;
  font-size: clamp(1rem, 1.25vw, 1.25rem);
  font-weight: 800;
  line-height: 1.12;
  text-shadow: 0 2px 8px rgba(0, 0, 0, .9);
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.poster-wrap :deep(.poster-meta) { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); padding: 0 !important; }
.poster-wrap :deep(.poster-meta > span) { color: rgba(255, 255, 255, .82); font-size: var(--fs-xs); font-weight: 650; }
.poster-wrap :deep(.poster-rating) { display: inline-flex !important; align-items: center; gap: var(--space-1); }
.poster-wrap :deep(.poster-rating svg) { width: 12px; height: 12px; color: #fbbf24; fill: currentColor; }
.poster-wrap :deep(.poster-action) {
  position: absolute;
  inset: auto 9px 9px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 34px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  font-weight: 800;
  text-align: center;
  text-decoration: none;
  box-shadow: 0 5px 16px rgba(0, 0, 0, .38);
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s ease;
}
.poster-wrap:hover :deep(.poster-action),
.poster-wrap:focus-within :deep(.poster-action),
.poster-wrap.revealed :deep(.poster-action) { opacity: 1; pointer-events: auto; }
.poster-wrap.has-action :deep(.poster-overlay) { padding-bottom: var(--card-action-padding, 58px); }
.poster-wrap :deep(.poster-action.nav-action) {
  border: 1px solid color-mix(in srgb, var(--text) 60%, transparent);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  color: var(--text) !important;
}
@media (max-width: 767.98px) {
  .poster-card:hover,
  .poster-card:focus-within { transform: translateY(-2px); }
  .poster-wrap :deep(.poster-overlay) { padding-inline: 10px; }
  .poster-wrap :deep(.poster-copy > strong) { font-size: var(--fs-base); }
}
@media (pointer: coarse) {
  .poster-card:hover,
  .poster-card:focus-within { transform: none; }
}
</style>
