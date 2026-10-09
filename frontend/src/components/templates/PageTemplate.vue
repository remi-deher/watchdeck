<template>
  <!-- Socle de tous les gabarits : la page du shell (AppPage), sa rangee d'onglets unique,
       la recherche et les filtres, et les etats de page communs. Les gabarits metier
       (Surveiller, Traiter…) le composent ; une page n'utilise jamais AppPage directement.

       Recherche et filtres, memes interactions partout : la recherche de la page vit dans
       la barre du haut (UiSearchField), sur toutes les pages et au fil du defilement ; son
       bouton « Filtres » porte le nombre de filtres actifs et ouvre la feuille commune
       (FilterSidebar), qui montre les filtres actifs en tete et se termine par
       Reinitialiser / Fermer. La page fournit seulement `search`, ses groupes de filtres
       (emplacement `filters`) et le nombre de filtres actifs. -->
  <AppPage
    v-bind="$attrs"
    :title="title"
    :hide-search="!search"
    :query="query"
    :placeholder="search?.placeholder"
    :search-scope="search?.scope || title"
    :search-kind="search?.kind || 'filter'"
    :match-count="matchCount"
    :total-count="totalCount"
    :has-filters="Boolean($slots.filters)"
    :filters-open="filtersOpen"
    :active-count="filterCount"
    :error="state === 'error' ? error : ''"
    :loading="state === 'loading'"
    :loading-message="loadingMessage"
    retry
    @update:query="emit('update:query', $event)"
    @toggle-filters="filtersOpen = !filtersOpen"
    @retry="emit('retry')"
  >
    <!-- La seule rangee d'onglets de la page : une page n'en ajoute pas d'autre. -->
    <template v-if="tabs.length > 1" #tabs>
      <AppSubnav :items="tabs" :active="activeTab" :aria-label="tabsLabel || `Vues de ${title}`" />
    </template>
    <template v-if="$slots.tools" #tools><slot name="tools" /></template>

    <FilterSidebar
      v-if="$slots.filters"
      :open="filtersOpen"
      :active-count="filterCount"
      :chips="filterChips"
      :match-count="matchCount"
      @close="filtersOpen = false"
      @reset="emit('reset-filters')"
    >
      <slot name="filters" />
    </FilterSidebar>

    <UiEmptyState v-if="state === 'unconfigured'" :title="unconfigured.title" :message="unconfigured.message" :icon="unconfigured.icon">
      <template v-if="unconfigured.actionTo" #action>
        <UiButton :to="unconfigured.actionTo" variant="primary">{{ unconfigured.actionLabel || 'Configurer' }}</UiButton>
      </template>
    </UiEmptyState>
    <UiEmptyState v-else-if="state === 'empty'" :title="empty.title" :message="empty.message" :icon="empty.icon" />
    <slot v-else-if="state === 'ready'" />
  </AppPage>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { FilterChip } from '@/composables/useFiltersDrawer';
import type { PageSearchKind } from '@/composables/usePageSearch';
import AppPage from '@/components/ui/AppPage.vue';
import AppSubnav, { type SubnavItem } from '@/components/ui/AppSubnav.vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

/** `ready` montre le contenu ; les autres etats le remplacent, a l'identique partout. */
export type PageState = 'ready' | 'loading' | 'error' | 'unconfigured' | 'empty';

export interface PageMessage {
  title: string;
  message?: string;
  icon?: any;
  /** Etat « non configure » : ou aller brancher le service. */
  actionTo?: string;
  actionLabel?: string;
}

/** La recherche de la page, rendue dans la barre du haut. */
export interface PageSearchOptions {
  placeholder: string;
  /** `filter` reduit la liste affichee (par defaut) ; `search` interroge un corpus. */
  kind?: PageSearchKind;
  /** Perimetre lisible, cle de l'historique des recherches (par defaut, le titre). */
  scope?: string;
}

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    title: string;
    /** Onglets de la page : vues d'une meme entree du menu. */
    tabs?: SubnavItem[];
    activeTab?: string;
    tabsLabel?: string;
    /** Absente, la barre du haut garde la recherche globale de l'application. */
    search?: PageSearchOptions | null;
    query?: string;
    /** Resultats retenus et total, pour un filtre : « 43 sur 348 ». */
    matchCount?: number | null;
    totalCount?: number | null;
    /** Nombre de filtres actifs, sur le bouton « Filtres ». */
    filterCount?: number;
    /** Filtres actifs en pastilles, en tete de la feuille ; deduits des groupes sinon. */
    filterChips?: FilterChip[];
    state?: PageState;
    error?: string;
    loadingMessage?: string;
    unconfigured?: PageMessage;
    empty?: PageMessage;
  }>(),
  {
    tabs: () => [],
    activeTab: '',
    tabsLabel: '',
    search: null,
    query: '',
    matchCount: null,
    totalCount: null,
    filterCount: 0,
    filterChips: () => [],
    state: 'ready',
    error: '',
    loadingMessage: 'Chargement…',
    unconfigured: () => ({ title: 'Service non configuré' }),
    empty: () => ({ title: 'Rien à afficher' }),
  },
);
const emit = defineEmits<{ retry: []; 'update:query': [value: string]; 'reset-filters': [] }>();

const filtersOpen = ref(false);
</script>
