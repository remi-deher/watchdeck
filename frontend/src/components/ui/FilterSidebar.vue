<template>
  <!-- Un seul panneau, sur toutes les tailles d'ecran : il sort de la barre de recherche.
       Sur telephone la barre est en bas, il monte au-dessus d'elle ; au-dela elle est en
       haut, il descend en dessous. La colonne de 210px du bureau a disparu : elle
       retrecissait la grille et decalait la page selon qu'elle etait ouverte ou non. -->
  <BarSheet :open="open" title="Filtres" @close="$emit('close')">
    <!-- Ce qui est actif, en tete : on le voit en ouvrant, et on le retire d'un appui
         sans chercher le groupe qui le porte. -->
    <FilterChips :groups="groups" :chips="chips" clearable @clear="$emit('reset')" />
    <div class="filter-modal-body">
      <slot />
    </div>
    <!-- Pas de pied : les filtres s'appliquent en direct, les pastilles en tete les
         retirent (« Tout effacer » a partir de deux), et la croix ferme la feuille. -->
  </BarSheet>
</template>

<script setup lang="ts">
import { provide, shallowReactive } from 'vue';
import { FILTER_CHIP_REGISTRY, type FilterChip } from '@/composables/useFiltersDrawer';
import FilterChips from './FilterChips.vue';
import BarSheet from './BarSheet.vue';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    activeCount?: number;
    /** Filtres actifs, en puces retirables en tete du panneau. Facultatif : par defaut
     *  elles sont deduites des groupes de puces du panneau (voir FILTER_CHIP_REGISTRY). */
    chips?: FilterChip[];
    /** Nombre de resultats retenus (garde pour les appelants ; le pied qui l'affichait a disparu). */
    matchCount?: number | null;
  }>(),
  {
    open: false,
    activeCount: 0,
    chips: () => [],
    matchCount: null,
  }
);

defineEmits<{
  (e: 'close'): void;
  (e: 'reset'): void;
}>();

const groups = shallowReactive(new Map<symbol, () => FilterChip[]>());
provide(FILTER_CHIP_REGISTRY, {
  register: (id, chips) => { groups.set(id, chips); },
  unregister: (id) => { groups.delete(id); },
});
/* Les puces se lisent dans un composant a part, jamais ici : ce rendu-ci englobe le
   dialogue Reka, et y lire le registre -- que les groupes remplissent a leur montage,
   donc pendant ce meme rendu -- le relancait en boucle (« Maximum recursive updates »). */


</script>

<style scoped lang="scss">
/* filter-group / group-label / filter-badge : styles globaux dans styles/layout/_layout.scss.
   Geometrie du panneau (ancrage a la barre) : styles/components/_components.scss. */
.filter-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}
.filter-modal-body :deep(select),
.filter-modal-body :deep(input[type="search"]) {
  width: 100%;
}
.filter-modal-body :deep(.ui-button),
.filter-modal-body :deep(button.danger) {
  width: 100%;
  justify-content: center;
}
</style>
