<script setup lang="ts">
/* Rend un emplacement confie par un autre composant (outils de page, rendus par la barre
   du haut) : son contenu garde l'etat et les actions de la page qui l'a fourni. */
import type { Slot } from 'vue';

const props = defineProps<{ slotFn: Slot }>();
const render = () => props.slotFn();
</script>

<template>
  <component :is="render" />
</template>
