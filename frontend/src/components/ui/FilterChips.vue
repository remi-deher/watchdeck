<!--
  Puces des filtres actifs, en tete du panneau de filtres.

  A part de FilterSidebar pour une raison de reactivite : ici seulement se lit le
  registre des groupes de puces (voir FILTER_CHIP_REGISTRY). Un changement de filtre ne
  re-rend donc que cette liste, pas le dialogue qui l'entoure.
-->
<template>
  <!-- Ce qui est actif, en tete : on le voit en ouvrant, et on le retire d'un appui
       sans chercher le groupe qui le porte. -->
  <ul v-if="active.length" class="filter-chips" aria-label="Filtres actifs">
    <li v-for="chip in active" :key="chip.key">
      <button type="button" class="filter-chip" :aria-label="`Retirer le filtre ${chip.label}`" @click="chip.onRemove()">
        <span>{{ chip.label }}</span>
        <X aria-hidden="true" />
      </button>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { X } from '@lucide/vue';
import type { FilterChip } from '@/composables/useFiltersDrawer';

const props = defineProps<{
  /** Groupes enregistres par le panneau : chacun dit ce qu'il retient. */
  groups: Map<symbol, () => FilterChip[]>;
  /** Puces fournies par la page ; prioritaires sur celles deduites des groupes. */
  chips: FilterChip[];
}>();

const active = computed<FilterChip[]>(() =>
  props.chips.length ? props.chips : [...props.groups.values()].flatMap((chips) => chips())
);
</script>

<style scoped lang="scss">
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  padding: 0;
  list-style: none;
}
.filter-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  min-height: 30px;
  padding: 0 10px 0 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
}
.filter-chip svg { width: 13px; height: 13px; }
.filter-chip:hover { background: color-mix(in srgb, var(--accent) 24%, transparent); }
</style>
