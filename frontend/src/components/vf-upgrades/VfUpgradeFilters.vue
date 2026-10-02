<template>
  <FilterSidebar :open="open" :active-count="activeCount" @close="emit('close')" @reset="emit('reset')">
    <FilterGroup label="Statut">
      <UiChipGroup label="Statut" :options="statusOptions" :model-value="status" @update:model-value="(v) => emit('update:status', v)">
        <template #option="{ option }"><span>{{ option.label }}</span><small v-if="option.count">({{ option.count }})</small></template>
      </UiChipGroup>
    </FilterGroup>

    <FilterGroup label="Type de média">
      <UiChipGroup label="Type de média" :options="MEDIA_OPTIONS" :model-value="mediaType" @update:model-value="(v) => emit('update:mediaType', v)" />
    </FilterGroup>

    <FilterGroup label="Maintenance">
      <div class="filter-maintenance-buttons">
        <UiButton class="compact" title="Réouvrir les suggestions en échec" @click="emit('maintenance', 'recompute')">
          <RotateCcw :size="14" />
          <span>Réouvrir les échecs</span>
        </UiButton>
        <UiButton class="compact" title="Supprimer les entrées archivées" @click="emit('maintenance', 'purge')">
          <Trash2 :size="14" />
          <span>Purger l'historique</span>
        </UiButton>
      </div>
    </FilterGroup>
  </FilterSidebar>
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import { RotateCcw, Trash2 } from '@lucide/vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import { computed } from 'vue';

/** Tiroir de filtres de l'onglet « Releases » : statut, type de media, maintenance. */
const props = defineProps<{
  open: boolean;
  activeCount: number;
  status: string;
  mediaType: string;
  counts: {
    pendingCount: number;
    waitingReleaseCount: number;
    inProgressCount: number;
    failedCount: number;
    historyCount: number;
    ignoredCount: number;
  };
}>();
const emit = defineEmits<{
  'update:status': [value: string];
  'update:mediaType': [value: string];
  maintenance: [action: 'recompute' | 'purge'];
  close: [];
  reset: [];
}>();

const MEDIA_OPTIONS = [
  { value: '', label: 'Tous les types' },
  { value: 'movie', label: 'Films' },
  { value: 'show', label: 'Séries' },
];
const statusOptions = computed(() => [
  { value: 'pending', label: 'À traiter', count: props.counts.pendingCount },
  { value: 'waiting_release', label: 'En attente de release', count: props.counts.waitingReleaseCount },
  { value: 'in_progress', label: 'En cours', count: props.counts.inProgressCount },
  { value: 'failed', label: 'Échecs', count: props.counts.failedCount },
  { value: 'history', label: 'Historique', count: props.counts.historyCount },
  { value: 'ignored', label: 'Ignorées', count: props.counts.ignoredCount },
  { value: 'all', label: 'Tous les statuts' },
]);
</script>

<style scoped lang="scss">
.filter-maintenance-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-maintenance-buttons button {
  width: 100%;
  justify-content: flex-start;
}
</style>
