<template>
  <!-- Fiche technique d'un fichier, depuis l'inventaire d'Analyses (dans la feuille) ou par
       son adresse (en pleine page). -->
  <SheetPage
    eyebrow="Fichier média"
    headless
    :title="item ? titleOf(item) : 'Fichier média'"
    :pager="pager"
    :loading="query.isPending.value"
    @navigate="navigate"
    :error="query.error.value ? 'Ce média est introuvable dans l’analyse de la bibliothèque.' : ''"
  >
    <AnalyticsItemDetail
      v-if="item"
      :item="item"
      :technical="technical.data.value || null"
      :technical-loading="technical.isFetching.value && !technical.data.value"
      :technical-error="Boolean(technical.error.value)"
    />
  </SheetPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { useSheetPager } from '@/composables/useSheetPager';
import SheetPage from '@/components/layout/SheetPage.vue';
import AnalyticsItemDetail from '@/components/library/AnalyticsItemDetail.vue';

const route = useRoute();
const key = computed(() => String(route.params.ratingKey || ''));
const query = useQuery({
  queryKey: computed(() => ['library-analytics', 'item', key.value]),
  queryFn: ({ signal }) => api<Record<string, any>>(`/api/library-analytics/items/${encodeURIComponent(key.value)}`, { signal }),
  enabled: computed(() => Boolean(key.value)),
  retry: 0,
});
const item = computed(() => query.data.value || null);
/* La fiche Plex complete du fichier (profils, HDR, pistes detaillees) : lue a part, pour
   que la fiche s'affiche des l'instantane, sans attendre Plex. */
const technical = useQuery({
  queryKey: computed(() => ['library-analytics', 'item', key.value, 'technical']),
  queryFn: ({ signal }) => api<Record<string, any>>(`/api/library-analytics/items/${encodeURIComponent(key.value)}/technical`, { signal }),
  enabled: computed(() => Boolean(key.value)),
  retry: 0,
  staleTime: 5 * 60_000,
});
const titleOf = (row: any): string => (row.grandparent_title ? `${row.grandparent_title} · ${row.title}` : row.title);

const { pager, navigate } = useSheetPager(key, (cible) => `/analytics/item/${encodeURIComponent(cible)}`);
</script>
