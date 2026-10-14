<template>
  <PageTemplate
    :title="pageTitle"
    v-model:query="query"
    :search="{ placeholder: searchPlaceholder, scope: 'Explorer', kind: 'search' }"
    :tabs="isSourceMode ? [] : EXPLORER_TABS"
    :active-tab="explorerTabFor(route.path)"
    tabs-label="Vues d’Explorer"
    :filter-count="activeFilterCount"
    :filter-chips="chips"
    @reset-filters="resetFilters"
  >
    <template #filters>
      <FilterGroupList :groups="filterGroups" />
    </template>

    <RequestQuotaNotice />

    <BrowseTemplate
      v-if="browsing"
      :rows="browse.rows"
      :hero="browse.hero"
      :hero-loading="browse.heroLoading"
      :hero-eyebrow="browse.heroEyebrow"
      :item-key="(item: any) => mediaRequestKey(item)"
      @retry="retryRow"
      @open-row="openRow"
    >
      <template #item="{ item, row }">
        <MediaPosterCard
          :to="detailPath(item)"
          :media="item"
          :action-label="cardActionLabel(item)"
          :requestable="requestableRow(row) && canRequest(item)"
          :request-busy="requesting.includes(mediaRequestKey(item))"
          @request="requestMedia"
        />
      </template>

      <template #row-sources>
        <DiscoverSourcesRail
          title="Plateformes de streaming & studios"
          heading-id="sources-heading"
          :sources="sources"
          :source-path="sourcePath"
          :loading="sourcesLoading"
          :error="sourcesError"
          @retry="loadSources"
        />
      </template>

      <template #row-personalized>
        <section class="personalized-discovery" aria-labelledby="personalized-heading">
          <header class="personalized-header">
            <div>
              <span class="eyebrow">Selon votre historique Plex</span>
              <h2 id="personalized-heading">Pour vous</h2>
              <p v-if="personalized.seeds.length">Inspiré par {{ personalized.seeds.map((item: any) => item.title).join(', ') }}</p>
            </div>
            <div class="personalized-options" aria-label="Préférences de recommandation">
              <UiCheckboxField v-model="hideAvailable" label="Masquer les médias dans Plex" @update:model-value="reloadPersonalized" />
              <UiCheckboxField v-model="hideWatched" label="Masquer les médias déjà vus" @update:model-value="reloadPersonalized" />
            </div>
          </header>
          <UiFeedback v-if="personalized.error" type="error" :message="personalized.error" retry @retry="loadPersonalized" />
          <MediaRail v-else title="Parce que vous avez regardé…" :items="personalized.recommended.items" :loading="personalized.loading" allow-request :requesting="requesting" @request="requestMedia" />
          <MediaRail v-if="personalized.preferred_genres.items.length" title="Dans vos genres préférés" :items="personalized.preferred_genres.items" allow-request :requesting="requesting" @request="requestMedia" />
          <MediaRail v-if="personalized.unwatched_popular.items.length" title="Populaires et jamais vus" :items="personalized.unwatched_popular.items" allow-request :requesting="requesting" @request="requestMedia" />
          <MediaRail v-if="personalized.followed_series.items.length" title="Nouveaux épisodes de vos séries suivies" :items="personalized.followed_series.items" allow-request :requesting="requesting" @request="requestMedia" />
        </section>
      </template>

      <template #row-genres>
        <MediaRail
          v-for="rail in GENRE_RAILS"
          :key="rail.key"
          :title="rail.title"
          :more-to="{ path: '/discover/explore', query: { genre: rail.genre } }"
          :items="home[rail.key].items"
          :loading="home[rail.key].loading"
          :error="home[rail.key].error"
          allow-request
          :requesting="requesting"
          @retry="loadHomeSection(rail.key)"
          @request="requestMedia"
        />
      </template>
    </BrowseTemplate>

    <ExploreTemplate
      v-else
      :items="displayedItems"
      :item-key="(item: any) => mediaRequestKey(item)"
      :total="availability ? null : totalResults"
      :unit="['média', 'médias']"
      :chips="chips"
      :loading="loading"
      :loading-more="loadingMore"
      :has-more="hasMore"
      :error="error"
      empty-title="Aucun média"
      empty-message="Aucun média ne correspond à ces filtres."
      @reset="resetFilters"
      @load-more="loadMore"
      @retry="reload"
    >
      <template #item="{ item, index }">
        <MediaPosterCard
          :style="{ '--card-index': index % 20 }"
          :to="detailPath(item)"
          :media="item"
          :action-label="cardActionLabel(item)"
          :requestable="canRequest(item)"
          :request-busy="requesting.includes(mediaRequestKey(item))"
          @request="requestMedia"
        />
      </template>
    </ExploreTemplate>

    <RequestOptionsModal
      :open="optionsDialog.open"
      :media-title="optionsDialog.item ? (optionsDialog.item.title || optionsDialog.item.name) : ''"
      :requesters="optionsDialog.requesters"
      :folders="optionsDialog.folders"
      :plex-user-id="optionsDialog.plexUserId"
      :root-folder="optionsDialog.rootFolder"
      :busy="optionsDialog.busy"
      @update:plex-user-id="v => optionsDialog.plexUserId = v"
      @update:root-folder="v => optionsDialog.rootFolder = v"
      @cancel="cancelOptions"
      @confirm="confirmOptions"
    />
  </PageTemplate>
</template>

<script setup lang="ts">
/* Explorer : deux besoins sur une meme page, chacun son gabarit. L'accueil et la page d'une
   plateforme se parcourent (banniere et rangees, gabarit Parcourir) ; le catalogue, un
   diffuseur ou une recherche s'explorent (grille filtree, gabarit Explorer). Le champ de
   recherche reste le meme d'un mode a l'autre : taper sur l'accueil bascule en grille
   sans le demonter. Les demandes sont une page a part (DiscoverRequestsView). */
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import BrowseTemplate from '@/components/templates/BrowseTemplate.vue';
import ExploreTemplate from '@/components/templates/ExploreTemplate.vue';
import DiscoverSourcesRail from '@/components/discover/DiscoverSourcesRail.vue';
import MediaRail from '@/components/discover/MediaRail.vue';
import RequestQuotaNotice from '@/components/discover/RequestQuotaNotice.vue';
import MediaPosterCard from '@/components/media/MediaPosterCard.vue';
import RequestOptionsModal from '@/components/media/RequestOptionsModal.vue';
import FilterGroupList from '@/components/ui/FilterGroupList.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import { EXPLORER_TABS, explorerTabFor } from '@/navigation';
import { useToast } from '@/composables/useToast';
import { mediaRequestKey } from '@/composables/useDirectMediaRequest';
import { useDiscoverExplorer } from '@/composables/useDiscoverExplorer';

const route = useRoute();
const {
  query, browsing, browse, retryRow, openRow, requestableRow,
  pageTitle, searchPlaceholder, isSourceMode,
  filterGroups, chips, activeFilterCount, resetFilters,
  personalized, hideAvailable, hideWatched, reloadPersonalized, loadPersonalized,
  sources, sourcesLoading, sourcesError, loadSources, sourcePath,
  home, GENRE_RAILS, loadHomeSection,
  displayedItems, totalResults, hasMore, loading, loadingMore, error, loadMore, reload, availability,
  requesting, requestError, requestSuccess, requestMedia, optionsDialog, confirmOptions, cancelOptions,
  detailPath, cardActionLabel, canRequest,
} = useDiscoverExplorer();

/* Reussites et echecs d'une demande : un message qui passe, pas un bandeau. */
const toast = useToast();
watch(requestError, (message) => { if (message) { toast.error('Demande impossible', message); requestError.value = ''; } });
watch(requestSuccess, (message) => { if (message) { toast.success(message); requestSuccess.value = ''; } });
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

/* « Pour vous » : une rangee propre a la page, dans un cadre teinte. */
.personalized-discovery { display: grid; gap: var(--space-5); padding: 20px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--surface) 92%, var(--accent) 8%); }
.personalized-header { display: flex; align-items: start; justify-content: space-between; gap: var(--space-4); }
.personalized-header h2 { margin: 2px 0 0; font-size: var(--fs-xl); }
.personalized-header p { max-width: 680px; margin: 5px 0 0; color: var(--muted); font-size: var(--fs-sm); }
.personalized-options { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }

@include bp.until(tablet) {
  .personalized-discovery { padding: 14px; }
  .personalized-header { display: grid; }
  .personalized-options { display: grid; }
}
</style>
