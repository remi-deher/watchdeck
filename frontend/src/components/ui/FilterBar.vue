<template>
  <section class="ui-filter-bar" v-bind="$attrs" aria-label="Filtres">
    <div v-if="$slots.primary" class="ui-filter-primary"><slot name="primary" /></div>
    <div class="ui-filter-desktop">
      <slot name="filters" />
      <button v-if="activeCount" class="ui-filter-reset" type="button" @click="$emit('reset')">Réinitialiser</button>
    </div>
    <UiButton class="ui-filter-mobile-trigger" :aria-expanded="open" @click="open=true">
      <SlidersHorizontal/>Filtres<span v-if="activeCount" class="ui-filter-count">{{ activeCount }}</span>
    </UiButton>
  </section>

  <Teleport to="body">
    <Transition name="filter-sheet" :duration="220">
      <div v-if="open" class="ui-filter-overlay" @click.self="close">
        <section ref="panelRef" tabindex="-1" class="ui-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title">
          <header><div><span>Affichage</span><h2 id="filter-sheet-title">Filtres</h2></div><UiButton variant="ghost" icon-only aria-label="Fermer" @click="close"><X/></UiButton></header>
          <div class="ui-filter-sheet-content"><slot name="filters" /></div>
          <footer>
            <UiButton :disabled="!activeCount" @click="$emit('reset')">Réinitialiser</UiButton>
            <UiButton variant="primary" @click="close">{{ resultCount == null ? 'Afficher les résultats' : `Afficher ${resultCount} résultat${resultCount > 1 ? 's' : ''}` }}</UiButton>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { SlidersHorizontal, X } from '@lucide/vue';
import { useModalA11y } from '@/composables/useModalA11y';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import UiButton from './UiButton.vue';

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    activeCount?: number;
    resultCount?: number | null;
  }>(),
  {
    activeCount: 0,
    resultCount: null,
  }
);

defineEmits<{
  (e: 'reset'): void;
}>();

const open = ref(false);
function close(): void {
  open.value = false;
}
const panelRef = ref<HTMLElement | null>(null);
useBodyScrollLock(open);
useModalA11y(panelRef, open, close);
</script>
