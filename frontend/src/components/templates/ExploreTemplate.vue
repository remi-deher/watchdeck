<template>
  <!-- Gabarit « Explorer » : repond a « qu'est-ce que j'ai, qu'est-ce que je cherche ? ».
         - les types : onglets de la page (`tabs` de PageTemplate), jamais dans les filtres ;
         - la recherche : celle de la barre du haut (`v-model:query` sur PageTemplate) ;
         - les filtres : panneau lateral, feuille sur telephone (emplacement `filters`) ;
         - les filtres actifs en pastilles retirables, au-dessus des resultats ;
         - le nombre de resultats, le tri, la bascule grille / liste ;
         - les elements (emplacement `item`, une carte commune qui ouvre la fiche), en
           defilement continu.
       Deux etats, comme la Bibliotheque : sans filtre ni recherche, la page peut fournir un
       `hub` -- banniere hero (MediaHeroBanner) puis rangees horizontales (MusicHubRow) ;
       des qu'on filtre ou cherche, la grille des resultats.
       On n'y decide ni n'y corrige rien : c'est la fiche qui porte les actions. -->
  <div class="psh-layout explore">
    <FilterSidebar
      v-if="$slots.filters"
      :open="filtersOpen"
      :active-count="chips.length"
      :chips="chips"
      :match-count="total"
      @close="emit('update:filtersOpen', false)"
      @reset="emit('reset')"
    >
      <slot name="filters" />
    </FilterSidebar>

    <div v-if="hub" class="psh-main explore__main explore__hub">
      <MediaHeroBanner v-if="hub.hero?.length" :items="hub.hero" :discover-context="false" @open="emit('open', $event)" />
      <MusicHubRow
        v-for="row in hub.rows"
        :key="row.key"
        :title="row.title"
        :items="row.items"
        :loading="row.loading"
        :more-to="row.moreTo || null"
        @open="emit('open', $event)"
      />
    </div>

    <div v-else class="psh-main explore__main">
      <div v-if="chips.length" class="explore__chips">
        <FilterChips :groups="NO_GROUPS" :chips="chips" />
        <button type="button" class="explore__clear" @click="emit('reset')">Tout effacer</button>
      </div>

      <div class="explore__bar">
        <p class="explore__count" aria-live="polite">{{ countText }}</p>
        <div class="explore__controls">
          <UiSelect v-if="sortOptions.length" :model-value="sort" :options="sortOptions" ariaLabel="Trier" @update:model-value="emit('update:sort', $event)" />
          <UiSegmentedControl v-if="views.length > 1" :model-value="view" :options="VIEW_OPTIONS.filter((o) => views.includes(o.value))" ariaLabel="Affichage" @update:model-value="emit('update:view', $event)" />
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
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import InfiniteScrollTrigger from '@/components/ui/InfiniteScrollTrigger.vue';
import MediaHeroBanner from '@/components/media/MediaHeroBanner.vue';
import MusicHubRow from '@/components/library/MusicHubRow.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue';

export type ExploreView = 'grid' | 'list';

/** L'accueil d'une page Explorer, sans filtre ni recherche : hero, puis rangees. */
export interface ExploreHub {
  hero?: any[];
  rows: Array<{ key: string; title: string; items: any[]; loading?: boolean; moreTo?: string | Record<string, any> | null }>;
}

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
    filtersOpen?: boolean;
    sortOptions?: UiSelectOption[];
    sort?: unknown;
    view?: ExploreView;
    /** Affichages proposes ; un seul, pas de bascule. */
    views?: ExploreView[];
    hasMore?: boolean;
    loading?: boolean;
    loadingMore?: boolean;
    emptyTitle?: string;
    emptyMessage?: string;
    /** Fourni sans filtre ni recherche : remplace la grille par l'accueil (hero, rangees). */
    hub?: ExploreHub | null;
  }>(),
  {
    itemKey: undefined,
    total: null,
    unit: () => ['élément', 'éléments'],
    chips: () => [],
    filtersOpen: false,
    sortOptions: () => [],
    sort: undefined,
    view: 'grid',
    views: () => ['grid', 'list'],
    hasMore: false,
    loading: false,
    loadingMore: false,
    emptyTitle: 'Rien ici pour l’instant',
    emptyMessage: '',
    hub: null,
  },
);
const emit = defineEmits<{
  'update:filtersOpen': [open: boolean];
  'update:sort': [value: unknown];
  'update:view': [value: ExploreView];
  /** Retirer tous les filtres. */
  reset: [];
  'load-more': [];
  /** Ouvrir la fiche d'un element du hub. */
  open: [item: any];
}>();

/* Les pastilles viennent de la page : pas de registre de groupes a lire ici. */
const NO_GROUPS = new Map<symbol, () => FilterChip[]>();
const VIEW_OPTIONS: Array<{ value: ExploreView; label: string }> = [
  { value: 'grid', label: 'Grille' },
  { value: 'list', label: 'Liste' },
];

const keyOf = (item: T, index: number) => (props.itemKey ? props.itemKey(item, index) : ((item as any)?.id ?? index));
const countText = computed(() => {
  const count = props.total ?? props.items.length;
  const [one, many] = props.unit;
  return `${count} ${count > 1 ? many : one} ${props.chips.length ? (count > 1 ? 'correspondent' : 'correspond') : ''}`.trim();
});
</script>

<style scoped lang="scss">
.explore__main.explore__hub { gap: var(--space-5); }
.explore__main { display: grid; align-content: start; gap: var(--space-3); min-width: 0; }
.explore__chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.explore__chips :deep(.filter-chips) { margin: 0; }
.explore__clear { border: 0; background: transparent; color: var(--accent); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.explore__bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.explore__count, .explore__loading { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.explore__controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
</style>
