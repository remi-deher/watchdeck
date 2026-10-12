<template>
  <ConnectionsVerdict/>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-tmdb><TmdbConnectionItem/></template>
    <template #section-seer><SeerConnectionItem/></template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import { Clapperboard, Radar } from '@lucide/vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import ConnectionsVerdict from './connections/ConnectionsVerdict.vue';
import SeerConnectionItem from './connections/SeerConnectionItem.vue';
import TmdbConnectionItem from './connections/TmdbConnectionItem.vue';

const page = useSettingsPage();
const sections = [
  { key: 'tmdb', title: 'TMDB', description: 'Fiches, affiches, suggestions et région de Découvrir.', icon: Clapperboard, keywords: ['tmdb', 'themoviedb', 'clé api', 'région', 'métadonnées'] },
  { key: 'seer', title: 'Seer', description: 'Overseerr ou Jellyseerr : source d’information ou acteur des demandes.', icon: Radar, keywords: ['seerr', 'overseerr', 'jellyseerr', 'url', 'clé api', 'observateur', 'acteur'] },
];
</script>
