<template>
  <div class="settings-rows">
    <PlexServersList/>
    <PlexActivitySection/>
    <h2 class="settings-merged-heading">Bibliothèque & VF</h2>
    <LibraryTab/>
  </div>
</template>
<script setup lang="ts">
import PlexServersList from './connections/PlexServersList.vue';
import PlexActivitySection from './connections/PlexActivitySection.vue';
import LibraryTab from './LibraryTab.vue';
</script>
<style scoped lang="scss">
.settings-merged-heading { margin: var(--space-2) 0 0; font-size: var(--fs-lg); }
</style>
