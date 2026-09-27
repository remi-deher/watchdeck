<template>
  <div class="sheet-summary">
    <!-- Resume d'une fiche : tronque a quelques lignes, avec « Lire la suite » seulement
         s'il deborde reellement. Un compte de caracteres se trompait selon la largeur de
         l'ecran (bouton sans effet sur grand ecran, texte coupe sans bouton sur mobile). -->
    <p ref="textRef" class="sheet-summary__text" :class="{ open }" :style="{ '--summary-lines': lines }">{{ text }}</p>
    <button v-if="open || clamped" type="button" class="sheet-summary__toggle" :aria-expanded="open" @click="open = !open">
      {{ open ? 'Réduire' : 'Lire la suite' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useResizeObserver } from '@vueuse/core';

const props = withDefaults(defineProps<{ text: string; lines?: number }>(), { lines: 3 });

const open = ref(false);
const clamped = ref(false);
const textRef = ref<HTMLElement | null>(null);

function measure(): void {
  const el = textRef.value;
  clamped.value = Boolean(el && !open.value && el.scrollHeight > el.clientHeight + 1);
}

useResizeObserver(textRef, measure);
watch(() => props.text, () => {
  open.value = false;
  void nextTick(measure);
});
</script>

<style scoped>
.sheet-summary { display: grid; justify-items: start; gap: 4px; }
.sheet-summary__text {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--text) 90%, transparent);
  font-size: var(--fs-base);
  line-height: 1.6;
  -webkit-line-clamp: var(--summary-lines, 3);
  -webkit-box-orient: vertical;
}
.sheet-summary__text.open { display: block; }
.sheet-summary__toggle {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font-size: var(--fs-xs);
  font-weight: 700;
  cursor: pointer;
}
.sheet-summary__toggle:hover { text-decoration: underline; }
</style>
