<template>
  <Transition name="slide-up">
    <div v-if="open" class="mobile-more-overlay" @click.self="$emit('close')">
      <div
        :id="sheetId"
        ref="panelRef"
        class="mobile-more-sheet"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${sheetId}-title`"
        tabindex="-1"
      >
        <div class="sheet-header">
          <h2 :id="`${sheetId}-title`">{{ title }}</h2>
          <button type="button" class="close-sheet-btn" aria-label="Fermer le menu" @click="$emit('close')">
            <X />
          </button>
        </div>
        <div class="sheet-content"><slot /></div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue';
import { X } from '@lucide/vue';
import { useModalA11y } from '@/composables/useModalA11y';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';

const props = defineProps<{
  open: boolean;
  sheetId: string;
  title: string;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();
const panelRef = ref<HTMLElement | null>(null);
const openRef = toRef(props, 'open');

useBodyScrollLock(openRef);
useModalA11y(panelRef, openRef, () => emit('close'));
</script>
