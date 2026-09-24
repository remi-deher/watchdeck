<template>
  <!-- Tiroir de detail : Reka UI tient le focus, Echap, le clic a cote et le defilement ;
       la geometrie (feuille laterale sur ordinateur, plein ecran sur telephone) est celle
       de `.detail-drawer` dans les feuilles de style globales. -->
  <DialogRoot :open="true" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="drawer-backdrop drawer-backdrop--detail-drawer" />
      <DialogContent class="detail-drawer" :class="{ wide }" :aria-describedby="undefined">
        <slot name="background" />
        <header class="drawer-head">
          <div>
            <span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
            <DialogTitle as="h2">{{ title || 'Détail' }}</DialogTitle>
          </div>
          <div class="drawer-head-actions"><slot name="head-actions" /><UiButton variant="ghost" icon-only title="Fermer" aria-label="Fermer" @click="emit('close')"><X /></UiButton></div>
        </header>
        <UiFeedback v-if="error" type="error" :message="error" />
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
<script setup lang="ts">
import { X } from '@lucide/vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { useBackButtonClose } from '@/composables/useBackButtonClose';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
withDefaults(defineProps<{ eyebrow?: string; title?: string; wide?: boolean; error?: string }>(), { eyebrow: '', title: '', wide: false, error: '' });
const emit = defineEmits<{ (e: 'close'): void }>();
function onOpenChange(open: boolean): void { if (!open) emit('close'); }
useBackButtonClose(null, () => emit('close'));
</script>
