<template>
  <div class="settings-rows">
    <SettingsItemList title="Services" subtitle="Sources et compléments facultatifs. Ouvrez une ligne pour la configurer.">
      <TmdbConnectionItem/>
      <SeerConnectionItem/>
      <TracearrConnectionItem/>
      <TautulliConnectionItem/>
    </SettingsItemList>
    <ArrInstancesList/>
  </div>
</template>
<script setup lang="ts">
import SettingsItemList from './SettingsItemList.vue';
import TautulliConnectionItem from './connections/TautulliConnectionItem.vue';
import TracearrConnectionItem from './connections/TracearrConnectionItem.vue';
import SeerConnectionItem from './connections/SeerConnectionItem.vue';
import TmdbConnectionItem from './connections/TmdbConnectionItem.vue';
import ArrInstancesList from './connections/ArrInstancesList.vue';
</script>
