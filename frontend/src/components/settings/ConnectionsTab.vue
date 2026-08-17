<template>
  <div class="settings-merged">
    <div class="settings-grid">
      <div class="settings-cards span-two">
        <PlexConnectionCard/>
        <PlexActivityCard/>
      </div>
    </div>
    <h2 class="settings-merged-heading">Bibliothèque & VF</h2>
    <LibraryTab/>
  </div>
</template>
<script setup lang="ts">
import PlexConnectionCard from './connections/PlexConnectionCard.vue';
import PlexActivityCard from './connections/PlexActivityCard.vue';
import LibraryTab from './LibraryTab.vue';
</script>
<style scoped lang="scss">
.settings-merged-heading { margin: var(--space-2) 0 0; font-size: var(--fs-lg); }
</style>
