<template>
  <div class="drawer-backdrop" @click.self="$emit('close')">
    <aside ref="panelRef" tabindex="-1" class="detail-drawer" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title || 'Detail'">
      <slot name="background" />
      <header class="drawer-head">
        <div><span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span><h2>{{ title }}</h2></div>
        <UiButton variant="ghost" icon-only title="Fermer" aria-label="Fermer" @click="$emit('close')"><X /></UiButton>
      </header>
      <UiFeedback v-if="error" type="error" :message="error" />
      <slot />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { X } from '@lucide/vue';
import { useModalA11y } from '@/composables/useModalA11y';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';

withDefaults(
  defineProps<{
    eyebrow?: string;
    title?: string;
    wide?: boolean;
    error?: string;
  }>(),
  {
    eyebrow: '',
    title: '',
    wide: false,
    error: '',
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const panelRef = ref<HTMLElement | null>(null);
useBodyScrollLock();
useModalA11y(panelRef, null, () => emit('close'));
</script>
