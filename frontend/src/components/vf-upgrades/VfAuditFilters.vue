<template>
  <FilterSidebar :open="open" :active-count="activeCount" @close="emit('close')" @reset="emit('reset')">
    <FilterGroup label="Anomalie / Opportunité">
      <UiChipGroup label="Anomalie / Opportunité" :options="issueOptions" :model-value="issue" @update:model-value="(v) => emit('update:issue', v)">
        <!-- Le compteur reste un complement entre parentheses : en `.count`, il ferait passer
             la pastille en pleine largeur. -->
        <template #option="{ option }"><span>{{ option.label }}</span><small v-if="option.count">({{ option.count }})</small></template>
      </UiChipGroup>
    </FilterGroup>

    <FilterGroup label="Type de média">
      <UiChipGroup label="Type de média" :options="MEDIA_OPTIONS" :model-value="mediaType" @update:model-value="(v) => emit('update:mediaType', v)" />
    </FilterGroup>
  </FilterSidebar>
</template>

<script setup lang="ts">
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import { computed } from 'vue';
import type { AuditCounts } from '@/composables/vf/types';

/** Tiroir de filtres de l'onglet « Alignement des pistes » : anomalie et type de media. */
const props = defineProps<{
  open: boolean;
  activeCount: number;
  issue: string;
  mediaType: string;
  counts: AuditCounts;
  /** Medias alignables (« Prets a aligner »). */
  eligibleCount: number;
}>();
const emit = defineEmits<{
  'update:issue': [value: string];
  'update:mediaType': [value: string];
  close: [];
  reset: [];
}>();

const MEDIA_OPTIONS = [
  { value: '', label: 'Tous les types' },
  { value: 'movie', label: 'Films' },
  { value: 'show', label: 'Séries' },
];
const issueOptions = computed(() => [
  { value: '', label: 'Toutes les anomalies', count: props.counts.total },
  { value: 'eligible', label: 'Prêts à aligner', count: props.eligibleCount },
  { value: 'audio_secondary', label: 'Audio FR secondaire', count: props.counts.audio_secondary },
  { value: 'forced_sub_not_default', label: 'ST forcé inactif', count: props.counts.forced_sub_not_default },
  { value: 'sub_fr_not_default', label: 'ST VO inactif', count: props.counts.sub_fr_not_default },
  { value: 'partial_vf', label: 'Séries partielles', count: props.counts.partial_vf },
]);
</script>
