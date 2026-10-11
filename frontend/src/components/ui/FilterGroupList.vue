<template>
  <FilterGroup v-for="group in groups" :key="group.key" :label="group.label" :default-open="!group.collapsed" :value="group.summary">
    <UiChipGroup :label="group.label" :options="group.options" :default-value="group.fallback" :model-value="group.value" @update:model-value="group.set(String($event ?? ''))" />
  </FilterGroup>
</template>

<script setup lang="ts">
import type { FilterGroupDefinition } from '@/composables/useFiltersDrawer';
import FilterGroup from './FilterGroup.vue';
import UiChipGroup from './UiChipGroup.vue';

/* Les groupes de filtres d'une page, a partir de leurs definitions (donnees) : le meme rendu
   partout, dans l'emplacement `filters` de PageTemplate. */
defineProps<{ groups: FilterGroupDefinition[] }>();
</script>
