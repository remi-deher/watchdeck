<template>
  <!-- Barre de progression Reka UI : meme rendu sur tous les navigateurs (WebKit dessinait
       la <progress> native a sa facon), `role="progressbar"` et valeurs annoncees. La barre
       avance par `transform`, sans recalcul de mise en page. -->
  <ProgressRoot class="ui-progress" :model-value="valeur" :max="max" :aria-label="label || undefined">
    <ProgressIndicator class="ui-progress__bar" :style="{ transform: `translateX(-${100 - (valeur / max) * 100}%)` }" />
  </ProgressRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ProgressIndicator, ProgressRoot } from 'reka-ui';

const props = withDefaults(defineProps<{ value?: number | null; max?: number; label?: string }>(), { value: 0, max: 100, label: '' });
const valeur = computed(() => Math.min(props.max, Math.max(0, Number(props.value) || 0)));
</script>

<style scoped lang="scss">
.ui-progress { position: relative; overflow: hidden; width: 100%; height: 6px; border-radius: 999px; background: var(--surface-3); }
.ui-progress__bar { width: 100%; height: 100%; border-radius: inherit; background: var(--accent); transition: transform var(--motion-duration-base) var(--motion-ease-standard); }
@media (prefers-reduced-motion: reduce) { .ui-progress__bar { transition: none; } }
</style>
