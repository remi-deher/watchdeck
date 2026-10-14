<!--
  Feuille ancrée (navigation, sections) : voile, focus tenu, Échap et clic sur le voile
  gérés par Reka UI. Le composant n'existe que pendant l'ouverture : il émet `close`
  quand on la referme. Le titre accessible est rendu ici ; avec `header-class` il forme
  un en-tête avec l'emplacement `head-actions` (bouton de fermeture), sans lui il se
  pose seul. `before` accueille ce qui précède le titre (poignée).
-->
<template>
  <DialogRoot :open="true" @update:open="(open) => { if (!open) emit('close'); }">
    <DialogPortal>
      <DialogOverlay :class="scrimClass" />
      <DialogContent :class="contentClass" :aria-describedby="undefined" @interact-outside="emit('interact-outside', $event)">
        <slot name="before" />
        <header v-if="headerClass" :class="headerClass">
          <DialogTitle :as="titleAs" :class="titleClass">{{ title }}</DialogTitle>
          <slot name="head-actions" />
        </header>
        <DialogTitle v-else :as="titleAs" :class="titleClass">{{ title }}</DialogTitle>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';

withDefaults(
  defineProps<{
    title: string;
    titleAs?: string;
    titleClass?: string;
    headerClass?: string;
    scrimClass?: string;
    contentClass?: string;
  }>(),
  { titleAs: 'h2', titleClass: '', headerClass: '', scrimClass: '', contentClass: '' }
);

const emit = defineEmits<{
  close: [];
  'interact-outside': [event: Event];
}>();
</script>
