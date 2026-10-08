<template>
  <div class="settings-rows">
    <ConnectionsVerdict/>
    <PlexServersList/>
    <SettingsItemList title="Activité en direct" subtitle="Lectures en cours et historique : Plex d'abord, Tracearr et Tautulli en complément.">
      <TracearrConnectionItem/>
      <TautulliConnectionItem/>
    </SettingsItemList>
    <PlexActivitySection/>
  </div>
</template>
<script setup lang="ts">
import SettingsItemList from './SettingsItemList.vue';
import ConnectionsVerdict from './connections/ConnectionsVerdict.vue';
import PlexServersList from './connections/PlexServersList.vue';
import PlexActivitySection from './connections/PlexActivitySection.vue';
import TautulliConnectionItem from './connections/TautulliConnectionItem.vue';
import TracearrConnectionItem from './connections/TracearrConnectionItem.vue';
</script>
