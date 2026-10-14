<!--
  Bloc repliable simple : un déclencheur et son contenu. Reka relie le bouton au contenu
  (aria-controls, aria-expanded). Les classes de la page vont sur la racine ; le
  déclencheur et le contenu se règlent par `trigger-class` et `content-class`.
  Pour une section à chargement paresseux et état mémorisé, voir `UiDisclosure`.
-->
<template>
  <CollapsibleRoot :open="open" :default-open="defaultOpen" :unmount-on-hide="unmountOnHide" @update:open="emit('update:open', $event)">
    <CollapsibleTrigger :class="triggerClass"><slot name="trigger" /></CollapsibleTrigger>
    <CollapsibleContent :class="contentClass"><slot /></CollapsibleContent>
  </CollapsibleRoot>
</template>

<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';

withDefaults(
  defineProps<{
    /** Pilotage par le parent (`v-model:open`) ; omis, le bloc garde son propre état. */
    open?: boolean;
    defaultOpen?: boolean;
    /** `false` garde le contenu monté une fois replié (champs de formulaire). */
    unmountOnHide?: boolean;
    triggerClass?: string;
    contentClass?: string;
  }>(),
  { open: undefined, defaultOpen: false, unmountOnHide: true, triggerClass: '', contentClass: '' }
);

const emit = defineEmits<{ 'update:open': [value: boolean] }>();
</script>
