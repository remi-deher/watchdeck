<template>
  <FilterSidebar :open="open" :active-count="activeCount" @close="emit('close')" @reset="emit('reset')">
    <FilterGroup label="Statut">
      <button
        class="filter-badge"
        :class="{ active: status === 'pending' }"
        type="button"
        @click="emit('update:status', 'pending')"
      >
        <span>À traiter</span>
        <small v-if="counts.pendingCount">({{ counts.pendingCount }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: status === 'waiting_release' }"
        type="button"
        @click="emit('update:status', 'waiting_release')"
      >
        <span>En attente de release</span>
        <small v-if="counts.waitingReleaseCount">({{ counts.waitingReleaseCount }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: status === 'in_progress' }"
        type="button"
        @click="emit('update:status', 'in_progress')"
      >
        <span>En cours</span>
        <small v-if="counts.inProgressCount">({{ counts.inProgressCount }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: status === 'failed' }"
        type="button"
        @click="emit('update:status', 'failed')"
      >
        <span>Échecs</span>
        <small v-if="counts.failedCount">({{ counts.failedCount }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: status === 'history' }"
        type="button"
        @click="emit('update:status', 'history')"
      >
        <span>Historique</span>
        <small v-if="counts.historyCount">({{ counts.historyCount }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: status === 'ignored' }"
        type="button"
        @click="emit('update:status', 'ignored')"
      >
        <span>Ignorées</span>
        <small v-if="counts.ignoredCount">({{ counts.ignoredCount }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: status === 'all' }"
        type="button"
        @click="emit('update:status', 'all')"
      >
        <span>Tous les statuts</span>
      </button>
    </FilterGroup>

    <FilterGroup label="Type de média">
      <button
        class="filter-badge"
        :class="{ active: !mediaType }"
        type="button"
        @click="emit('update:mediaType', '')"
      >
        <span>Tous les types</span>
      </button>
      <button
        class="filter-badge"
        :class="{ active: mediaType === 'movie' }"
        type="button"
        @click="emit('update:mediaType', 'movie')"
      >
        <span>Films</span>
      </button>
      <button
        class="filter-badge"
        :class="{ active: mediaType === 'show' }"
        type="button"
        @click="emit('update:mediaType', 'show')"
      >
        <span>Séries</span>
      </button>
    </FilterGroup>

    <FilterGroup label="Maintenance">
      <div class="filter-maintenance-buttons">
        <button class="secondary compact" type="button" title="Réouvrir les suggestions en échec" @click="emit('maintenance', 'recompute')">
          <RotateCcw :size="14" />
          <span>Réouvrir les échecs</span>
        </button>
        <button class="secondary compact" type="button" title="Supprimer les entrées archivées" @click="emit('maintenance', 'purge')">
          <Trash2 size="14" />
          <span>Purger l'historique</span>
        </button>
      </div>
    </FilterGroup>
  </FilterSidebar>
</template>

<script setup lang="ts">
import { RotateCcw, Trash2 } from '@lucide/vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';

/** Tiroir de filtres de l'onglet « Releases » : statut, type de media, maintenance. */
defineProps<{
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
