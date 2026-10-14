<template>
  <!-- Calendrier (gabarit Anticiper) : qu'est-ce qui sort, et quand ? Trois vues (agenda, semaine,
       mois), la période, la légende des états et la recherche sont celles du gabarit ; la page
       fournit les sorties, leurs états et la carte riche de l'agenda. -->
  <PageTemplate
    title="Calendrier"
    v-model:query="search"
    :search="{ placeholder: 'Filtrer les titres', scope: 'Calendrier', kind: 'filter' }"
    :filter-count="chips.length"
    :filter-chips="chips"
    @reset-filters="resetFilters"
  >
    <template #filters>
      <FilterGroupList :groups="filterGroups" />
    </template>

    <PlanTemplate
      v-model:cursor="cursor"
      :events="events"
      :states="states"
      :searching="searching"
      :search-scope="`de ${searchScope}`"
      preference-key="calendar.view"
      :unit="['sortie', 'sorties']"
      :loading="loading"
      :error="error"
      empty-title="Aucune sortie"
      @update:view="view = $event"
      @open="openDetail"
      @retry="reload"
    >
      <template #agenda-item="{ event, time }">
        <CalendarEventCard :event="event as any" :time="time" :now="now" @open="openDetail" @play="openPlex" />
      </template>
    </PlanTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
import PageTemplate from '@/components/templates/PageTemplate.vue';
import PlanTemplate from '@/components/templates/PlanTemplate.vue';
import CalendarEventCard from '@/components/calendar/CalendarEventCard.vue';
import FilterGroupList from '@/components/ui/FilterGroupList.vue';
import { useCalendar } from '@/composables/useCalendar';

const {
  search, cursor, view, searching, searchScope, events, states, loading, error, reload, now,
  filterGroups, chips, resetFilters, openDetail, openPlex,
} = useCalendar();
</script>
