<template>
  <!-- Acquisition : trois sections, chacune son gabarit. Clients (Gérer et Surveiller) est
       migrée ; la file d'attente et la vue d'ensemble suivent. L'adresse porte la section. -->
  <DownloadsClientsView v-if="section === 'clients'" />
  <DownloadsLegacyView v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import DownloadsClientsView from './downloads/DownloadsClientsView.vue';
import DownloadsLegacyView from './downloads/DownloadsLegacyView.vue';

const route = useRoute();
const section = computed(() => (['queue', 'clients'].includes(String(route.query.view)) ? String(route.query.view) : 'overview'));
</script>
