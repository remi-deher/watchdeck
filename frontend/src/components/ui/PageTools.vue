<template>
  <!-- Outils de page fournis par un gabarit ou un bloc (periode, vue…) : confies a la
       capsule de recherche de la barre du haut (usePageTools) ; sans barre (tests,
       fenetres), rendus sur place. -->
  <div v-if="!hostReady" class="page-tools"><slot /></div>
</template>

<script setup lang="ts">
import { useSlots } from 'vue';
import { providePageTools, usePageTools, type PageToolsZone } from '@/composables/usePageTools';

const props = withDefaults(defineProps<{ disabled?: boolean; zone?: PageToolsZone }>(), { disabled: false, zone: 'tools' });
const slots = useSlots();
const { hostReady } = usePageTools();
providePageTools(() => (hostReady.value && !props.disabled && slots.default ? () => slots.default!() : null), props.zone);
</script>

<style scoped>
.page-tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-width: 0; }
</style>
