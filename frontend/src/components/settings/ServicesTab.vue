<template>
  <div class="settings-rows">
    <ConnectionsVerdict/>
    <SettingsItemList title="Informations" subtitle="Métadonnées et demandes externes. Ouvrez une ligne pour la configurer.">
      <TmdbConnectionItem/>
      <SeerConnectionItem/>
    </SettingsItemList>
  </div>
</template>
<script setup lang="ts">
import SettingsItemList from './SettingsItemList.vue';
import ConnectionsVerdict from './connections/ConnectionsVerdict.vue';
import SeerConnectionItem from './connections/SeerConnectionItem.vue';
import TmdbConnectionItem from './connections/TmdbConnectionItem.vue';
</script>
