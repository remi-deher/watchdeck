<template>
  <!-- Acquisition : quatre sections, chacune son gabarit. Clients (Gérer et Surveiller), la
       file d'attente (Suivre) et l'historique (Comprendre) sont migrées ; la vue d'ensemble
       suit. L'adresse porte la section. -->
  <DownloadsClientsView v-if="section === 'clients'" />
  <DownloadsQueueView v-else-if="section === 'queue'" />
  <DownloadsHistoryView v-else-if="section === 'history'" />
  <DownloadsLegacyView v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import DownloadsClientsView from './downloads/DownloadsClientsView.vue';
import DownloadsHistoryView from './downloads/DownloadsHistoryView.vue';
import DownloadsLegacyView from './downloads/DownloadsLegacyView.vue';
import DownloadsQueueView from './downloads/DownloadsQueueView.vue';

const route = useRoute();
/* « Terminés » était un état de la file : c'est désormais l'historique, à part. */
const section = computed(() => {
  const view = String(route.query.view);
  if (view === 'queue' && route.query.sub === 'completed') return 'history';
  return ['queue', 'clients', 'history'].includes(view) ? view : 'overview';
});
</script>
