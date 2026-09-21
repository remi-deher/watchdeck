<template>
  <div class="filter-group">
    <button class="filter-group-header" type="button" :aria-expanded="open" :aria-controls="bodyId" @click="open = !open">
      <span class="group-label">{{ label }}</span>
      <!-- Replie, le groupe doit dire ce qu'il retient : un intitule seul oblige a
           deplier chaque groupe pour savoir si l'on y a choisi quelque chose. -->
      <span v-if="!open && value" class="filter-group-value">{{ value }}</span>
      <ChevronDown class="filter-group-chevron" :class="{ collapsed: !open }" />
    </button>
    <!-- Le depli s'anime en hauteur plutot que d'apparaitre d'un bloc : ouvrir « Genre »
         faisait surgir quatre rangees d'un coup, et l'oeil devait relire le panneau pour
         savoir ce qui venait de changer. `grid-template-rows` de 0fr a 1fr anime la
         hauteur reelle du contenu, sans la mesurer ni la figer.
         `inert` plutot qu'un simple masquage : replie, le contenu garde sa boite, et
         sans cela ses boutons restaient tabulables et lus par les lecteurs d'ecran. -->
    <div class="filter-group-reveal" :class="{ open }">
      <div :id="bodyId" class="filter-group-body" :inert="!open || undefined">
        <slot />
      </div>
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
.filter-group-reveal {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--motion-duration-medium, .22s) var(--motion-ease-standard, ease);
}
.filter-group-reveal.open { grid-template-rows: 1fr; }
.filter-group-reveal > * { min-height: 0; overflow: hidden; }

/* Aucune marge interne ici : la rangee de grille tombe bien a zero au repli, mais le
   `padding` d'un enfant s'ajoute par-dessus et n'est pas rogne par son `overflow`. Ces
   deux pixels laissaient depasser le haut des pastilles sous chaque en-tete replie --
   de petits traits qui donnaient au panneau l'air coupe. L'espacement sous le groupe
   est rendu par le `gap` de la pile, qui lui disparait avec le contenu. */
.filter-group-body {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

/* Les pastilles arrivent avec le depli, decalees de quelques millisecondes : c'est ce
   qui fait lire le groupe comme un ensemble qui s'ouvre plutot qu'un bloc qui apparait. */
.filter-group-reveal.open .filter-group-body > * {
  animation: filter-badge-in var(--motion-duration-fast, .15s) var(--motion-ease-standard, ease) backwards;
}
@keyframes filter-badge-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .filter-group-reveal { transition: none; }
  .filter-group-reveal.open .filter-group-body > * { animation: none; }
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
