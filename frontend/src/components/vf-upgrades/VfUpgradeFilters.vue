<template>
  <!-- Filtres des suggestions de release, poses dans la feuille de PageTemplate : ce qu'on
       affiche (l'a-traiter, l'archive, les ignores) et le type de media. Les gestes de
       maintenance sont ceux des types de probleme (Reouvrir les echecs, Purger). -->
  <div class="vf-filter-groups">
    <FilterGroup label="Afficher">
      <UiChipGroup label="Afficher" :options="viewOptions" :model-value="view" @update:model-value="(v) => emit('update:view', v)">
        <template #option="{ option }"><span>{{ option.label }}</span><small v-if="option.count">({{ option.count }})</small></template>
      </UiChipGroup>
    </FilterGroup>

    <FilterGroup label="Type de média">
      <UiChipGroup label="Type de média" :options="MEDIA_OPTIONS" :model-value="mediaType" @update:model-value="(v) => emit('update:mediaType', v)" />
    </FilterGroup>
  </div>
</template>

<script setup lang="ts">
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import { computed } from 'vue';

const props = defineProps<{
  view: string;
  mediaType: string;
  counts: { openCount: number; historyCount: number; ignoredCount: number };
}>();
const emit = defineEmits<{
  'update:view': [value: string];
  'update:mediaType': [value: string];
}>();

const MEDIA_OPTIONS = [
  { value: '', label: 'Tous les types' },
  { value: 'movie', label: 'Films' },
  { value: 'show', label: 'Séries' },
];
const viewOptions = computed(() => [
  { value: 'open', label: 'À traiter et en cours', count: props.counts.openCount },
  { value: 'history', label: 'Historique', count: props.counts.historyCount },
  { value: 'ignored', label: 'Ignorés', count: props.counts.ignoredCount },
]);
</script>
