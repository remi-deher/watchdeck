<template>
  <div class="rail-edge-controls">
    <button v-if="canLeft" class="rail-edge rail-edge-left" type="button" aria-label="Faire défiler vers la gauche" @click="$emit('scroll', -1)"><ChevronLeft /></button>
    <button v-if="canRight" class="rail-edge rail-edge-right" type="button" aria-label="Faire défiler vers la droite" @click="$emit('scroll', 1)"><ChevronRight /></button>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue';

defineProps<{
  canLeft?: boolean;
  canRight?: boolean;
}>();

defineEmits<{
  (e: 'scroll', direction: number): void;
}>();
</script>

<style scoped lang="scss">
.rail-edge-controls { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.rail-edge {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 100%;
  display: grid;
  place-items: center;
  width: clamp(44px, 5vw, 72px);
  padding: 0;
  border: 0;
  border-radius: 0;
  color: rgba(255,255,255,.9);
  cursor: pointer;
  pointer-events: auto;
  opacity: .88;
  transition: opacity .18s ease, color .18s ease;
}
.rail-edge:hover { color: #fff; opacity: 1; }
.rail-edge:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
.rail-edge-left { left: -8px; background: linear-gradient(90deg, rgba(0,0,0,.88) 0%, rgba(0,0,0,.52) 48%, transparent 100%); }
.rail-edge-right { right: -8px; background: linear-gradient(270deg, rgba(0,0,0,.88) 0%, rgba(0,0,0,.52) 48%, transparent 100%); }
.rail-edge svg { width: 28px; height: 28px; filter: drop-shadow(0 1px 4px rgba(0,0,0,.9)); }
@media (max-width: 640px) {
  .rail-edge-left { display: none; }
  .rail-edge { width: 48px; opacity: .72; }
  .rail-edge-right { right: -12px; }
  .rail-edge svg { width: 24px; height: 24px; }
}
</style>
