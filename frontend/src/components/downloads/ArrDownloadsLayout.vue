<template>
  <InstanceOverviewGrid
    v-if="instances.length"
    :arr-instances="instances"
    :configured-clients="[]"
    :arr-queue="arrQueue"
    :client-queue="[]"
    :wanted-items="wantedItems"
  />

  <UnmatchedImportsBanner :items="unmatchedItems" :row-key="rowKey" @view-all="$emit('view-unmatched')" @associate="$emit('associate', $event)" />
</template>

<script setup lang="ts">
import InstanceOverviewGrid from '@/components/downloads/InstanceOverviewGrid.vue';
import UnmatchedImportsBanner from '@/components/downloads/UnmatchedImportsBanner.vue';

withDefaults(
  defineProps<{
    instances?: any[];
    arrQueue?: any[];
    wantedItems?: any[];
    unmatchedItems?: any[];
    rowKey: (row: any) => string | number;
  }>(),
  {
    instances: () => [],
    arrQueue: () => [],
    wantedItems: () => [],
    unmatchedItems: () => [],
  }
);

defineEmits<{
  (e: 'view-unmatched'): void;
  (e: 'associate', row: any): void;
}>();
</script>
