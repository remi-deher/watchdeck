<template>
  <!-- Le verdict de la zone d'abord, puis une section par intention : serveurs, sources d'activité
       en direct, et réglages de collecte. -->
  <ConnectionsVerdict/>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-servers><PlexServersList/></template>
    <template #section-activity>
      <SettingsItemList>
        <TracearrConnectionItem/>
        <TautulliConnectionItem/>
      </SettingsItemList>
    </template>
    <template #section-collection><PlexActivitySection/></template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import { Activity, DatabaseZap, Server } from '@lucide/vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import SettingsItemList from './SettingsItemList.vue';
import ConnectionsVerdict from './connections/ConnectionsVerdict.vue';
import PlexServersList from './connections/PlexServersList.vue';
import PlexActivitySection from './connections/PlexActivitySection.vue';
import TautulliConnectionItem from './connections/TautulliConnectionItem.vue';
import TracearrConnectionItem from './connections/TracearrConnectionItem.vue';

const page = useSettingsPage();
const sections = [
  { key: 'servers', title: 'Serveurs Plex', description: 'Le serveur principal et les serveurs supplémentaires suivis par la Bibliothèque.', icon: Server, keywords: ['plex', '4k', 'token', 'url'] },
  { key: 'activity', title: 'Activité en direct', description: 'Lectures en cours et historique : Plex d\'abord, Tracearr et Tautulli en complément.', icon: Activity, keywords: ['tracearr', 'tautulli', 'lectures'] },
  { key: 'collection', title: 'Activité Plex', description: 'Collecte des lectures directement depuis Plex. Elle ne dépend pas de Tautulli.', icon: DatabaseZap, keywords: ['collecte', 'anonymiser', 'ip', 'historique', 'lieux'] },
];
</script>
