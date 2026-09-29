<template>
  <!-- Fiche technique d'un fichier, depuis l'inventaire d'Analyses (dans la feuille) ou par
       son adresse (en pleine page). -->
  <SheetPage
    eyebrow="Fichier média"
    headless
    :title="item ? titleOf(item) : 'Fichier média'"
    :loading="query.isPending.value"
    :error="query.error.value ? 'Ce média est introuvable dans l’analyse de la bibliothèque.' : ''"
  >
    <AnalyticsItemDetail
      v-if="item"
      :item="item"
      :technical="technical.data.value || null"
      :technical-loading="technical.isFetching.value && !technical.data.value"
      :technical-error="Boolean(technical.error.value)"
      :has-previous="index > 0"
      :has-next="index >= 0 && index < voisins.length - 1"
      @navigate="naviguer"
    />
  </SheetPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { useEventListener } from '@vueuse/core';
import { api } from '@/api';
import { etatDeSurfaceCourant, voisinsCourants } from '@/composables/useMediaOverlay';
import SheetPage from '@/components/layout/SheetPage.vue';
import AnalyticsItemDetail from '@/components/library/AnalyticsItemDetail.vue';

const route = useRoute();
const router = useRouter();
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

/* « Precedent / suivant » parcourt les lignes de l'inventaire d'ou l'on a ouvert la
   fiche, comme les sessions d'Activite. `replace` : « retour » ramene a la liste. */
const voisins = computed(() => { void route.fullPath; return voisinsCourants(); });
const index = computed(() => voisins.value.indexOf(key.value));
function naviguer(direction: number): void {
  const suivant = voisins.value[index.value + direction];
  if (!suivant) return;
  void router.replace({ path: `/analytics/item/${encodeURIComponent(suivant)}`, state: etatDeSurfaceCourant() as any });
}
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
  if (event.key === 'j') naviguer(1);
  else if (event.key === 'k') naviguer(-1);
});
</script>
