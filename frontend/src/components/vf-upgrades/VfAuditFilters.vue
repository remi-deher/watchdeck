<template>
  <FilterSidebar :open="open" :active-count="activeCount" @close="emit('close')" @reset="emit('reset')">
    <FilterGroup label="Anomalie / Opportunité">
      <button
        class="filter-badge"
        :class="{ active: !issue }"
        type="button"
        @click="emit('update:issue', '')"
      >
        <span>Toutes les anomalies</span>
        <small v-if="counts.total">({{ counts.total }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: issue === 'eligible' }"
        type="button"
        @click="emit('update:issue', 'eligible')"
      >
        <span>Prêts à aligner</span>
        <small>({{ eligibleCount }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: issue === 'audio_secondary' }"
        type="button"
        @click="emit('update:issue', 'audio_secondary')"
      >
        <span>Audio FR secondaire</span>
        <small v-if="counts.audio_secondary">({{ counts.audio_secondary }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: issue === 'forced_sub_not_default' }"
        type="button"
        @click="emit('update:issue', 'forced_sub_not_default')"
      >
        <span>ST forcé inactif</span>
        <small v-if="counts.forced_sub_not_default">({{ counts.forced_sub_not_default }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: issue === 'sub_fr_not_default' }"
        type="button"
        @click="emit('update:issue', 'sub_fr_not_default')"
      >
        <span>ST VO inactif</span>
        <small v-if="counts.sub_fr_not_default">({{ counts.sub_fr_not_default }})</small>
      </button>
      <button
        class="filter-badge"
        :class="{ active: issue === 'partial_vf' }"
        type="button"
        @click="emit('update:issue', 'partial_vf')"
      >
        <span>Séries partielles</span>
        <small v-if="counts.partial_vf">({{ counts.partial_vf }})</small>
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
  </FilterSidebar>
</template>

<script setup lang="ts">
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import type { AuditCounts } from '@/composables/vf/types';

/** Tiroir de filtres de l'onglet « Alignement des pistes » : anomalie et type de media. */
defineProps<{
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
</script>
