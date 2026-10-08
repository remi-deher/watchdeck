<template>
  <div class="settings-rows">
    <ConnectionsVerdict/>
    <!-- Trois blocs, un à la fois : serveurs, sources d'activité, et réglages de collecte. -->
    <AppSubnav variant="tabs" inner :items="SECTION_ITEMS" :active="section" aria-label="Sections de Plex" @update:active="section = $event" />
    <PlexServersList v-if="section === 'servers'"/>
    <SettingsItemList v-if="section === 'activity'" title="Activité en direct" subtitle="Lectures en cours et historique : Plex d'abord, Tracearr et Tautulli en complément.">
      <TracearrConnectionItem/>
      <TautulliConnectionItem/>
    </SettingsItemList>
    <PlexActivitySection v-if="section === 'collection'"/>
  </div>
</template>
<script setup lang="ts">
import AppSubnav from '@/components/ui/AppSubnav.vue';
import { useInnerSection } from '@/composables/useInnerSection';
import SettingsItemList from './SettingsItemList.vue';
import ConnectionsVerdict from './connections/ConnectionsVerdict.vue';
import PlexServersList from './connections/PlexServersList.vue';
import PlexActivitySection from './connections/PlexActivitySection.vue';
import TautulliConnectionItem from './connections/TautulliConnectionItem.vue';
import TracearrConnectionItem from './connections/TracearrConnectionItem.vue';

const SECTION_ITEMS = [
  { key: 'servers', label: 'Serveurs' },
  { key: 'activity', label: 'Activité en direct' },
  { key: 'collection', label: 'Collecte' },
];
const section = useInnerSection(SECTION_ITEMS.map((item) => item.key));
</script>
