<template>
  <!-- Journaux (gabarit Comprendre) : que s'est-il passé ? Un journal par source (demandes,
       application, tâches, audit), du plus récent au plus ancien, par jour ; le bilan des
       dernières 24 h en tête, le détail technique d'une entrée dans la feuille. Le suivi en
       direct est un outil de page. -->
  <PageTemplate
    title="Journaux"
    :tabs="tabs"
    :active-tab="type"
    tabs-label="Type de journal"
    v-model:query="search"
    :search="{ placeholder: 'Filtrer les journaux', scope: 'Journaux', kind: 'filter' }"
    :match-count="total"
    :total-count="count"
    :filter-count="chips.length"
    :filter-chips="chips"
    :state="error && !count ? 'error' : 'ready'"
    :error="error"
    @retry="reload"
    @reset-filters="resetFilters"
  >
    <template #filters>
      <FilterGroupList :groups="filterGroups" />
    </template>

    <template #tools>
      <UiButton size="sm" :variant="live ? 'primary' : 'secondary'" :aria-pressed="live" @click="live = !live">
        <template #icon><Radio /></template>{{ live ? 'Suivi en direct' : 'Suivre en direct' }}
      </UiButton>
    </template>

    <UnderstandTemplate
      :events="events"
      :detail="detail"
      :open-key="openKey"
      :outcomes="severities"
      :outcome="severity"
      :summary="summary"
      :exportable="total > 0"
      :has-more="hasMore"
      :loading="loading"
      empty-title="Aucune entrée"
      empty-message="Aucune entrée pour ce filtre."
      @update:outcome="severity = $event"
      @open="open"
      @close="close"
      @export="exportCsv"
      @load-more="loadMore"
    >
      <!-- Les envois en échec se retrouvent et se renvoient dans Notifications. -->
      <template #after>
        <p v-if="notificationErrors" class="log-notifications">
          {{ notificationErrors }} envoi{{ notificationErrors > 1 ? 's' : '' }} de notification en échec :
          <RouterLink :to="{ path: '/notifications', query: { tab: 'history' } }">voir les envois</RouterLink>
        </p>
      </template>
    </UnderstandTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { Radio } from '@lucide/vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import UnderstandTemplate from '@/components/templates/UnderstandTemplate.vue';
import FilterGroupList from '@/components/ui/FilterGroupList.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { useLogs } from '@/composables/useLogs';

const {
  type, tabs, search, severity, severities, live,
  events, total, count, hasMore, loadMore, loading, error, reload,
  filterGroups, chips, resetFilters, detail, openKey, open, close, summary, notificationErrors, exportCsv,
} = useLogs();
</script>

<style scoped lang="scss">
.log-notifications { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
