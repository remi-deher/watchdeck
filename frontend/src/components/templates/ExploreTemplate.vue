<template>
  <!-- Gabarit « Explorer » : repond a « qu'est-ce que j'ai, qu'est-ce que je cherche ? ».
         - les types : onglets de la page (`tabs` de PageTemplate), jamais dans les filtres ;
         - recherche, bouton « Filtres » et feuille des filtres : ceux du socle
           (PageTemplate : `search`, emplacement `filters`), communs a toutes les pages ;
           le tri et l'affichage y prennent place (bloc ExploreDisplay) ;
         - au-dessus des resultats, une ligne : le nombre de resultats en evidence et les
           filtres actifs en pastilles retirables ;
         - les elements (emplacement `item`, une carte commune qui ouvre la fiche), en
           defilement continu.
       On y arrive pour affiner : depuis la recherche, les filtres, ou le titre d'un rail du
       gabarit Parcourir, qui y mene deja regle par l'adresse.
       On n'y decide ni n'y corrige rien : c'est la fiche qui porte les actions. -->
  <div class="explore">
    <div class="explore__main">
      <div class="explore__summary">
        <p class="explore__count" aria-live="polite">{{ countText }}</p>
        <div v-if="chips.length" class="explore__chips">
          <FilterChips :groups="NO_GROUPS" :chips="chips" />
          <button v-if="chips.length > 1" type="button" class="explore__clear" @click="emit('reset')">Tout effacer</button>
        </div>
      </div>

      <p v-if="loading && !items.length" class="explore__loading">Chargement…</p>
      <section v-else-if="items.length" v-list-motion :class="view === 'list' ? 'panel media-list' : 'media-grid library-grid'" :aria-busy="loading">
        <template v-for="(item, index) in items" :key="keyOf(item, index)">
          <slot name="item" :item="item" :view="view" :index="index" />
        </template>
      </section>
      <UiEmptyState v-else :title="chips.length ? 'Aucun résultat' : emptyTitle" :message="chips.length ? 'Aucun élément ne correspond aux filtres actifs.' : emptyMessage">
        <template v-if="chips.length" #action><UiButton @click="emit('reset')">Réinitialiser les filtres</UiButton></template>
      </UiEmptyState>

      <InfiniteScrollTrigger :has-more="hasMore" :loading="loadingMore" @load="emit('load-more')" />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed } from 'vue';
import type { FilterChip } from '@/composables/useFiltersDrawer';
import FilterChips from '@/components/ui/FilterChips.vue';
import InfiniteScrollTrigger from '@/components/ui/InfiniteScrollTrigger.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

export type ExploreView = 'grid' | 'list';


const props = withDefaults(
  defineProps<{
    items: T[];
    itemKey?: (item: T, index: number) => string | number;
    /** Nombre total de resultats (au-dela de ceux deja charges). */
    total?: number | null;
    /** Ce qu'on compte, au singulier et au pluriel (« film », « films »). */
    unit?: [string, string];
    /** Filtres actifs, en pastilles retirables. */
    chips?: FilterChip[];
    /** Grille ou liste, choisi dans la feuille des filtres (bloc ExploreDisplay). */
    view?: ExploreView;
    hasMore?: boolean;
    loading?: boolean;
    loadingMore?: boolean;
    emptyTitle?: string;
    emptyMessage?: string;
  }>(),
  {
    itemKey: undefined,
    total: null,
    unit: () => ['élément', 'éléments'],
    chips: () => [],
    view: 'grid',
    hasMore: false,
    loading: false,
    loadingMore: false,
    emptyTitle: 'Rien ici pour l’instant',
    emptyMessage: '',
  },
);
const emit = defineEmits<{
  /** Retirer tous les filtres. */
  reset: [];
  'load-more': [];
}>();

/* Les pastilles viennent de la page : pas de registre de groupes a lire ici. */
const NO_GROUPS = new Map<symbol, () => FilterChip[]>();

const keyOf = (item: T, index: number) => (props.itemKey ? props.itemKey(item, index) : ((item as any)?.id ?? index));
const countText = computed(() => {
  const count = props.total ?? props.items.length;
  const [one, many] = props.unit;
  return `${count} ${count > 1 ? many : one} ${props.chips.length ? (count > 1 ? 'correspondent' : 'correspond') : ''}`.trim();
});
</script>

<style scoped lang="scss">
.explore__main { display: grid; align-content: start; gap: var(--space-3); min-width: 0; }
.explore__summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); min-width: 0; }
.explore__chips { display: flex; flex: 1 1 auto; align-items: center; gap: var(--space-2); min-width: 0; overflow-x: auto; scrollbar-width: none; }
.explore__chips :deep(.filter-chips) { flex-wrap: nowrap; }
.explore__chips :deep(.filter-chips) { margin: 0; }
.explore__clear { border: 0; background: transparent; color: var(--accent); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.explore__count { flex: none; margin: 0; font-family: var(--font-display); font-size: var(--fs-lg); font-weight: 700; }
.explore__loading { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
