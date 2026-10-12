<template>
  <!-- Filtre de l'alignement : le type de media. L'anomalie se choisit dans les types de
       probleme de la page (Traiter), pas ici. -->
  <div class="vf-filter-groups">
    <FilterGroup label="Type de média">
      <UiChipGroup label="Type de média" :options="MEDIA_OPTIONS" :model-value="mediaType" @update:model-value="(v) => emit('update:mediaType', v)" />
    </FilterGroup>
  </div>
</template>

<script setup lang="ts">
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';

defineProps<{ mediaType: string }>();
const emit = defineEmits<{ 'update:mediaType': [value: string] }>();

const MEDIA_OPTIONS = [
  { value: '', label: 'Tous les types' },
  { value: 'movie', label: 'Films' },
  { value: 'show', label: 'Séries' },
];
</script>
