<template>
  <PageTemplate title="Problèmes" v-model:query="query"
    :search="{ placeholder: 'Filtrer par média, message ou personne…', scope: 'Problèmes', kind: 'filter' }"
    :match-count="items.length" :total-count="total" :filter-count="filterCount" :filter-chips="chips"
    :state="error ? 'error' : loading ? 'loading' : 'ready'" :error="error" @retry="reload" @reset-filters="reset">
    <template #filters>
      <FilterGroup label="Statut">
        <UiChipGroup label="Statut" :options="statuses" v-model="status" />
      </FilterGroup>
      <FilterGroup v-if="types.length > 1" label="Type de problème">
        <UiChipGroup label="Type de problème" :options="[{ value: '', label: 'Tous les types' }, ...types.map(value => ({ value, label: labels[value] || value }))]" v-model="type" />
      </FilterGroup>
    </template>
    <HandleTemplate :items="items" :issues="groups" :busy="busy" :labels="{ items: 'signalements', empty: 'Aucun signalement', emptyDetail: 'Aucun signalement ne correspond à cette sélection.' }"
      @action="action" @note="note" />
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import HandleTemplate from '@/components/templates/HandleTemplate.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import { useHandlingProblems } from '@/composables/useHandlingProblems';

const { query, status, type, items, groups, types, labels, total, error, loading, busy, action, note, reset, reload } = useHandlingProblems();
const statuses = [
  { value: 'open', label: 'Ouverts' }, { value: 'investigating', label: 'En cours' },
  { value: 'closed', label: 'Clos' }, { value: 'all', label: 'Tous' },
];
const filterCount = computed(() => Number(status.value !== 'open') + Number(Boolean(type.value)));
const chips = computed(() => [
  ...(status.value !== 'open' ? [{ key: 'status', label: statuses.find(value => value.value === status.value)?.label || status.value, onRemove: () => { status.value = 'open'; } }] : []),
  ...(type.value ? [{ key: 'type', label: labels.value[type.value] || type.value, onRemove: () => { type.value = ''; } }] : []),
]);
</script>
