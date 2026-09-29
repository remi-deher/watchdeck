<template>
  <!-- Les trois rails de la bibliotheque (arrivees, demandes, sorties) partagent une seule
       rangee : un choix a la fois, retenu d'une visite a l'autre. Trois rails empiles
       prenaient pres de trois ecrans sur telephone. -->
  <section class="library-tabs">
    <UiSegmentedControl v-model="active" :options="options" ariaLabel="Contenu de la bibliothèque affiché" />
    <RecentlyAvailablePanel v-if="active === 'available'" :items="recentlyAvailable" />
    <MediaRail
      v-else-if="active === 'requests'"
      title="Demandes récentes"
      eyebrow="Demandes"
      :items="recentRequests"
      :more-to="{ path: '/library', query: { sort: 'requested_desc' } }"
      empty-message="Aucune demande récente."
    />
    <UpcomingReleasesPanel v-else :items="upcoming" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiSegmentedControl, { type UiSegmentedOption } from '@/components/ui/UiSegmentedControl.vue';
import MediaRail from '@/components/discover/MediaRail.vue';
import RecentlyAvailablePanel, { type RecentlyAvailableItem } from './RecentlyAvailablePanel.vue';
import UpcomingReleasesPanel, { type UpcomingReleaseItem } from './UpcomingReleasesPanel.vue';
import { usePreference } from '@/composables/usePreference';

type LibraryTab = 'available' | 'requests' | 'upcoming';

withDefaults(
  defineProps<{
    recentlyAvailable?: RecentlyAvailableItem[];
    recentRequests?: any[];
    upcoming?: UpcomingReleaseItem[];
  }>(),
  { recentlyAvailable: () => [], recentRequests: () => [], upcoming: () => [] }
);

const stored = usePreference<LibraryTab>('dashboard.libraryTab', 'available');
const options: UiSegmentedOption<LibraryTab>[] = [
  { value: 'available', label: 'Arrivés récemment' },
  { value: 'requests', label: 'Demandes récentes' },
  { value: 'upcoming', label: 'Sorties à venir' },
];
/* Une valeur inconnue (preference d'une ancienne version) retombe sur le premier onglet. */
const active = computed<LibraryTab>({
  get: () => (options.some((o) => o.value === stored.value) ? stored.value : 'available'),
  set: (value) => { stored.value = value; },
});
</script>

<style scoped lang="scss">
.library-tabs { display: grid; gap: var(--space-3); min-width: 0; }
.library-tabs > :deep(.ui-segmented-list) { justify-self: start; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
</style>
