<template>
  <div class="filter-select-group">
    <label v-for="filter in filters" :key="filter.key" class="filter-select-item">
      <span v-if="filter.label" class="filter-label">{{ filter.label }}</span>
      <select
        :value="filter.value"
        :aria-label="filter.label || filter.key"
        @change="$emit('update:filter', { key: filter.key, value: ($event.target as HTMLSelectElement).value })"
      >
        <option
          v-for="opt in filter.options"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
    </label>
  </div>
</template>

<script setup lang="ts">
export interface FilterOption {
  value: string | number;
  label: string;
}

export interface FilterItem {
  key: string;
  label?: string;
  value: string | number;
  options: FilterOption[];
}

defineProps<{
  filters: FilterItem[];
}>();

defineEmits<{
  (e: 'update:filter', payload: { key: string; value: string }): void;
}>();
</script>

<style scoped lang="scss">
.filter-select-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
  align-items: center;
}
.filter-select-item {
  display: flex;
  flex: 1 1 180px;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-xs, 0.75rem);
}
.filter-select-item select { width: 100%; min-width: 0; }
@media (min-width: 768px) {
  .filter-select-item { flex: 0 1 auto; }
  .filter-select-item select { width: auto; min-width: 150px; }
}
.filter-label {
  color: var(--muted, #a1a1aa);
  font-weight: 500;
}
</style>
