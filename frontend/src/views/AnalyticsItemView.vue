<template>
  <!-- Fiche technique d'un fichier, depuis l'inventaire d'Analyses (dans la feuille) ou par
       son adresse (en pleine page). -->
  <SheetPage
    eyebrow="Fichier média"
    :title="item ? titleOf(item) : 'Fichier média'"
    :loading="query.isPending.value"
    :error="query.error.value ? 'Ce média est introuvable dans l’analyse de la bibliothèque.' : ''"
  >
    <AnalyticsItemDetail v-if="item" :item="item" />
  </SheetPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
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
const titleOf = (row: any): string => (row.grandparent_title ? `${row.grandparent_title} · ${row.title}` : row.title);
</script>
