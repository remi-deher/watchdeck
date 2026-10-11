<template>
  <PageTemplate
    title="Mes demandes"
    :tabs="tabs"
    :active-tab="activeTab"
    tabs-label="Vues de Mes demandes"
    v-model:query="query"
    :search="activeTab === 'manquants' ? null : { placeholder: 'Filtrer les demandes…', scope: 'Demandes', kind: 'filter' }"
    :filter-count="activeFilterCount"
    :filter-chips="chips"
    :state="error && !items.length ? 'error' : 'ready'"
    :error="error"
    @retry="reload"
    @reset-filters="resetFilters"
  >
    <template v-if="activeTab !== 'manquants'" #filters>
      <FilterGroupList :groups="filterGroups" />
      <ExploreDisplay v-if="activeTab === 'disponibles'" v-model:sort="sort" v-model:view="view" :sort-options="sortOptions" />
    </template>

    <!-- Ce qui manque dans Sonarr et Radarr : le complement des demandes, pour les admins. -->
    <MissingItemsPanel v-if="activeTab === 'manquants'" />

    <TrackTemplate
      v-else-if="activeTab === 'suivi'"
      :items="trackItems"
      :recent="recent"
      :loading="loading"
      :labels="{ items: 'demandes', empty: 'Aucune demande en cours', emptyDetail: items.length ? 'Tout est arrivé : rien ne reste à suivre.' : 'Vous n’avez pas encore fait de demande.', recent: 'Demandes refusées' }"
      @action="onTrackAction"
    />

    <ExploreTemplate
      v-else
      :items="visible"
      :item-key="(item: any) => item.id"
      :total="total"
      :unit="['demande', 'demandes']"
      :chips="chips"
      :view="view"
      :loading="loading"
      :has-more="hasMore"
      empty-title="Aucune demande disponible"
      empty-message="Aucune demande arrivée ne correspond à ces filtres."
      @reset="resetFilters"
      @load-more="loadMore"
      @retry="reload"
    >
      <template #item="{ item, view: shown, animated }">
        <LibraryCard :item="{ ...item, _kind: 'request' }" :view="shown" :animated="animated" @open="openDetail" />
      </template>
    </ExploreTemplate>

    <ReasonPickerModal
      :open="!!pendingWithdraw"
      event="cancelled"
      :subtitle="pendingWithdraw ? `« ${pendingWithdraw.title} » sera retiré de Sonarr/Radarr et empêché de revenir automatiquement.` : ''"
      :initial="pendingWithdraw?.fulfillment_error || ''"
      :busy="busy"
      @cancel="pendingWithdraw = null"
      @confirm="confirmWithdraw"
    />
    <ReasonPickerModal
      :open="!!pendingReject"
      event="rejected"
      title="Refuser cette demande ?"
      :subtitle="pendingReject ? `« ${pendingReject.title} » ne sera pas ajouté ; le demandeur sera prévenu.` : ''"
      :busy="busy"
      @cancel="pendingReject = null"
      @confirm="confirmReject"
    />
  </PageTemplate>
</template>

<script setup lang="ts">
/* Mes demandes : deux besoins, deux gabarits. Ce qui est en route se suit (gabarit Suivre :
   blocages et leur cause, progression, actions d'un moderateur) ; ce qui est arrive s'explore
   (gabarit Explorer). Les elements manquants de Sonarr et Radarr restent un onglet d'admin. */
import PageTemplate from '@/components/templates/PageTemplate.vue';
import TrackTemplate from '@/components/templates/TrackTemplate.vue';
import ExploreTemplate from '@/components/templates/ExploreTemplate.vue';
import ExploreDisplay from '@/components/templates/explore/ExploreDisplay.vue';
import FilterGroupList from '@/components/ui/FilterGroupList.vue';
import LibraryCard from '@/components/library/LibraryCard.vue';
import MissingItemsPanel from '@/components/discover/MissingItemsPanel.vue';
import ReasonPickerModal from '@/components/requests/ReasonPickerModal.vue';
import { useMyRequests } from '@/composables/useMyRequests';

const {
  query, view, sort, sortOptions, busy, activeTab, tabs, items, loading, error, reload,
  trackItems, recent, onTrackAction, visible, total, hasMore, loadMore,
  filterGroups, chips, activeFilterCount, resetFilters, openDetail,
  pendingWithdraw, pendingReject, confirmWithdraw, confirmReject,
} = useMyRequests();
</script>
