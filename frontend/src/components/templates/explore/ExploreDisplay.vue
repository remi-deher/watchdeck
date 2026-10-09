<template>
  <!-- Tri et affichage d'une page Explorer, dans la feuille des filtres (emplacement
       `filters` de PageTemplate) : ils reglent ce qu'on voit, au meme endroit que les
       filtres, plutot qu'une barre d'outils de plus au-dessus des affiches. -->
  <FilterGroup v-if="sortOptions.length" label="Tri">
    <UiChipGroup label="Tri" :options="sortOptions" :model-value="sort" @update:model-value="emit('update:sort', $event)" />
  </FilterGroup>
  <FilterGroup v-if="views.length > 1" label="Affichage" :default-open="false">
    <UiSegmentedControl :model-value="view" :options="VIEW_OPTIONS.filter((option) => views.includes(option.value))" ariaLabel="Mode d’affichage" @update:model-value="emit('update:view', $event as ExploreView)" />
  </FilterGroup>
</template>

<script setup lang="ts">
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import type { ExploreView } from '../ExploreTemplate.vue';

withDefaults(
  defineProps<{
    sortOptions?: Array<{ value: string; label: string }>;
    sort?: string;
    view?: ExploreView;
    views?: ExploreView[];
  }>(),
  { sortOptions: () => [], sort: '', view: 'grid', views: () => ['grid', 'list'] },
);
const emit = defineEmits<{ 'update:sort': [value: string]; 'update:view': [value: ExploreView] }>();

const VIEW_OPTIONS: Array<{ value: ExploreView; label: string }> = [
  { value: 'grid', label: 'Grille' },
  { value: 'list', label: 'Liste' },
];
</script>
