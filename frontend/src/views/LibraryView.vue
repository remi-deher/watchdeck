<template>
  <PageTemplate
    title="Bibliothèque"
    v-model:query="query"
    :search="{ placeholder: 'Rechercher dans la bibliothèque…', scope: 'Bibliothèque', kind: 'filter' }"
    :tabs="LIBRARY_TYPE_TABS"
    :active-tab="libraryTypeTabFor(route)"
    tabs-label="Types de médias"
    :filter-count="activeFilterCount"
    :filter-chips="chips"
    :state="activeHub && error ? 'error' : 'ready'"
    :error="error"
    @retry="load"
    @reset-filters="resetFilters"
  >
    <template #filters>
      <FilterGroupList :groups="filterGroups" />
    </template>

    <BrowseTemplate v-if="activeHub" :rows="hubRows" :hero="heroItems" :hero-discover="false" :hero-status="false" @open="openDetail" @title-click="onHubTitleClick">
      <template #item="{ item }">
        <LibraryCard :item="item" view="grid" @open="openDetail" />
      </template>
    </BrowseTemplate>

    <ExploreTemplate
      v-else
      :items="items"
      :item-key="(item: any) => libraryItemKey(item)"
      :unit="['média', 'médias']"
      :chips="chips"
      :size="isMusicShape ? 'music' : 'standard'"
      :loading="loading"
      :loading-more="loadingMore"
      :has-more="hasMore"
      :error="error"
      empty-title="Aucun média"
      empty-message="Aucun média dans cette sélection."
      @reset="resetFilters"
      @load-more="loadMore"
      @retry="load"
    >
      <template #item="{ item, animated }">
        <LibraryCard :item="item" view="grid" :animated="animated" :server-names="serverNamesFor(item)" @open="openDetail" />
      </template>
    </ExploreTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
/* Bibliotheque : deux besoins sur une meme adresse, chacun son gabarit. Sans filtre, on
   parcourt (hubs : banniere et rangees, gabarit Parcourir) ; des qu'un filtre, une
   recherche ou le titre d'une rangee affine la vue, on explore (grille, gabarit
   Explorer). Les actions sur un media vivent dans sa fiche. */
import { useRoute } from 'vue-router';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import BrowseTemplate from '@/components/templates/BrowseTemplate.vue';
import ExploreTemplate from '@/components/templates/ExploreTemplate.vue';
import LibraryCard from '@/components/library/LibraryCard.vue';
import FilterGroupList from '@/components/ui/FilterGroupList.vue';
import { LIBRARY_TYPE_TABS, libraryTypeTabFor } from '@/navigation';
import { useLibraryExplorer } from '@/composables/useLibraryExplorer';

const route = useRoute();
const {
  query, activeHub, isMusicShape, filterGroups, chips, activeFilterCount, resetFilters,
  hubRows, heroItems, onHubTitleClick,
  items, loading, loadingMore, hasMore, error, load, loadMore,
  libraryItemKey, serverNamesFor, openDetail,
} = useLibraryExplorer();
</script>
