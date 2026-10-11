<template>
  <ConnectionsVerdict/>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-instances><ArrInstancesList/></template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import { ServerCog } from '@lucide/vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import ConnectionsVerdict from './connections/ConnectionsVerdict.vue';
import ArrInstancesList from './connections/ArrInstancesList.vue';

const page = useSettingsPage();
const sections = [
  { key: 'instances', title: 'Sonarr, Radarr, Prowlarr, Bazarr et FileFlows', description: 'Les instances branchées à Watchdeck : état, test, activation.', icon: ServerCog, keywords: ['sonarr', 'radarr', 'prowlarr', 'bazarr', 'fileflows', 'instance', 'api'] },
];
</script>
