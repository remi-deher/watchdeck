<template>
  <!-- Un groupe de filtres repliable, sur le Collapsible de Reka UI : etat annonce par le
       bouton, contenu retire du parcours clavier une fois replie. -->
  <CollapsibleRoot v-model:open="open" class="filter-group" :unmount-on-hide="false">
    <CollapsibleTrigger class="filter-group-header">
      <span class="group-label">{{ label }}</span>
      <!-- Replie, le groupe doit dire ce qu'il retient : un intitule seul oblige a
           deplier chaque groupe pour savoir si l'on y a choisi quelque chose. -->
      <span v-if="!open && value" class="filter-group-value">{{ value }}</span>
      <ChevronDown class="filter-group-chevron" :class="{ collapsed: !open }" aria-hidden="true" />
    </CollapsibleTrigger>
    <!-- Le depli s'anime en hauteur plutot que d'apparaitre d'un bloc : ouvrir « Genre »
         faisait surgir quatre rangees d'un coup, et l'oeil devait relire le panneau pour
         savoir ce qui venait de changer. Reka mesure le contenu et garde le repli monte le
         temps de son animation. -->
    <CollapsibleContent class="filter-group-reveal">
      <div class="filter-group-body">
        <slot />
      </div>
    </CollapsibleContent>
  </CollapsibleRoot>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';
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
  gap: var(--space-2);
  background: none;
  border: none;
  padding: 2px 0 6px;
  cursor: pointer;
  width: 100%;
  color: inherit;
  font: inherit;
}
.filter-group-header .group-label { margin-right: auto; }
.filter-group-header:hover .filter-group-chevron { color: var(--accent); }
.filter-group-chevron {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  transition: transform var(--motion-duration-fast) var(--motion-ease-standard), color var(--motion-duration-instant);
  flex-shrink: 0;
}
.filter-group-chevron.collapsed { transform: rotate(-90deg); }
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

.filter-group-reveal { overflow: hidden; }
.filter-group-reveal[data-state="open"] { animation: filter-group-open var(--motion-duration-medium, var(--motion-duration-fast)) var(--motion-ease-standard); }
.filter-group-reveal[data-state="closed"] { animation: filter-group-close var(--motion-duration-fast) var(--motion-ease-standard); }
@keyframes filter-group-open { from { height: 0; } to { height: var(--reka-collapsible-content-height); } }
@keyframes filter-group-close { from { height: var(--reka-collapsible-content-height); } to { height: 0; } }

/* Les options s'enroulent au lieu de s'empiler : ce sont des etiquettes courtes, et
   une par ligne faisait du panneau un rouleau de plusieurs milliers de pixels. Celles
   qui reclament la pleine largeur (compteur aligne a droite) la prennent quand meme --
   voir `.filter-badge--wide` -- et retombent alors naturellement a la ligne. */
.filter-group-body {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

@media (prefers-reduced-motion: reduce) {
  .filter-group-reveal[data-state] { animation: none; }
}
</style>
