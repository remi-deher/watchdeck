<template>
  <div class="settings-merged">
    <DataTab/>
    <h2 class="settings-merged-heading">Confidentialité (RGPD)</h2>
    <GdprTab/>
  </div>
</template>
<script setup lang="ts">
import DataTab from './DataTab.vue';
import GdprTab from './GdprTab.vue';
</script>
<style scoped lang="scss">
.settings-merged-heading { margin: var(--space-2) 0 0; font-size: var(--fs-lg); }
</style>
