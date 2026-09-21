<template>
  <div class="filter-group">
    <button class="filter-group-header" type="button" :aria-expanded="open" :aria-controls="bodyId" @click="open = !open">
      <span class="group-label">{{ label }}</span>
      <!-- Replie, le groupe doit dire ce qu'il retient : un intitule seul oblige a
           deplier chaque groupe pour savoir si l'on y a choisi quelque chose. -->
      <span v-if="!open && value" class="filter-group-value">{{ value }}</span>
      <ChevronDown class="filter-group-chevron" :class="{ collapsed: !open }" />
    </button>
    <div v-show="open" :id="bodyId" class="filter-group-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue';
import { ChevronDown } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    label: string;
    defaultOpen?: boolean;
    /** Resume affiche quand le groupe est replie : la valeur retenue, ou « Tous ». */
    value?: string;
  }>(),
  {
    defaultOpen: true,
    value: '',
  }
);

const open = ref(props.defaultOpen);
const bodyId = `filter-group-${useId()}`;
</script>

<style scoped lang="scss">
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.filter-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  padding: 2px 0 6px;
  cursor: pointer;
  width: 100%;
}
.filter-group-header:hover .filter-group-chevron {
  color: var(--accent);
}
.filter-group-chevron {
  width: 14px;
  height: 14px;
  color: var(--text-muted, #888);
  transition: transform 0.2s ease, color 0.15s;
  flex-shrink: 0;
}
.filter-group-chevron.collapsed {
  transform: rotate(-90deg);
}
/* Les options s'enroulent au lieu de s'empiler : ce sont des etiquettes courtes, et
   une par ligne faisait du panneau un rouleau de plusieurs milliers de pixels. Celles
   qui reclament la pleine largeur (compteur aligne a droite) la prennent quand meme --
   voir `.filter-badge--wide` -- et retombent alors naturellement a la ligne. */
.filter-group-body {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding-bottom: 2px;
}

.filter-group-value {
  margin-left: auto;
  overflow: hidden;
  max-width: 55%;
  color: var(--accent);
  font-size: var(--fs-xs);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filter-group-header { gap: var(--space-2); }
.filter-group-chevron { margin-left: 0; }
.filter-group-header .group-label { margin-right: auto; }
</style>
