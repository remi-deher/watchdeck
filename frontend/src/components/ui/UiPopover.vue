<!--
  Panneau flottant ancré à un déclencheur (choix rapide, mini-formulaire de lecture).
  Le déclencheur se fournit dans `trigger` (un seul élément, il reçoit le comportement) ;
  le panneau dans l'emplacement par défaut. `v-model:open` pour le piloter.
-->
<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child><slot name="trigger" /></PopoverTrigger>
    <PopoverPortal>
      <PopoverContent :class="contentClass" :side-offset="sideOffset" :collision-padding="8" :align="align"><slot /></PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';

withDefaults(
  defineProps<{ contentClass?: string; sideOffset?: number; align?: 'start' | 'center' | 'end' }>(),
  { contentClass: '', sideOffset: 6, align: 'center' }
);

const open = defineModel<boolean>('open', { default: false });
</script>
