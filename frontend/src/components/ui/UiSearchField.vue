<template>
  <div class="ui-search-field">
    <Search aria-hidden="true" class="ui-search-field__icon" />
    <input
      :value="query"
      type="search"
      :placeholder="placeholder"
      :aria-label="ariaLabel || placeholder"
      v-bind="$attrs"
      @input="onInput"
    >
    <template v-if="hasFilters">
      <span class="ui-search-field__sep" aria-hidden="true" />
      <button
        type="button"
        class="ui-search-field__filter"
        :class="{ active: filtersOpen || activeCount > 0 }"
        :aria-expanded="filtersOpen"
        :aria-label="filtersOpen ? 'Masquer les filtres' : 'Afficher les filtres'"
        @click="$emit('toggle-filters')"
      >
        <SlidersHorizontal aria-hidden="true" /><span>Filtres</span>
        <strong v-if="activeCount" class="ui-search-field__count">{{ activeCount }}</strong>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Search, SlidersHorizontal } from '@lucide/vue';

// Le champ de recherche de l'application, partage par le patron de page et par les
// barres d'outils qui en ont besoin sans etre un en-tete de page.
// Sans ce composant, la meme quinzaine de lignes de markup et de style vivait en deux
// exemplaires, et l'un des deux finissait toujours par diverger.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    query?: string;
    placeholder?: string;
    ariaLabel?: string;
    hasFilters?: boolean;
    filtersOpen?: boolean;
    activeCount?: number;
  }>(),
  {
    query: '',
    placeholder: 'Rechercher…',
    ariaLabel: '',
    hasFilters: false,
    filtersOpen: false,
    activeCount: 0,
  }
);

const emit = defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'search', event: Event): void;
  (e: 'toggle-filters'): void;
}>();

function onInput(event: Event): void {
  emit('update:query', (event.target as HTMLInputElement).value);
  emit('search', event);
}
</script>

<style scoped lang="scss">
.ui-search-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  max-width: 480px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.ui-search-field__icon { flex: none; width: 16px; height: 16px; color: var(--muted); }
.ui-search-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: var(--fs-sm);
  outline: 0;
}
.ui-search-field__sep { flex: none; width: 1px; height: 18px; background: var(--border); }

.ui-search-field__filter {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 4px 0 8px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  white-space: nowrap;
  cursor: pointer;
}
.ui-search-field__filter:hover { color: var(--text); }
.ui-search-field__filter.active { color: var(--accent); }
.ui-search-field__filter svg { width: 15px; height: 15px; }
.ui-search-field__count {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #1a1400;
  font-size: 10px;
  font-weight: 700;
}
</style>
