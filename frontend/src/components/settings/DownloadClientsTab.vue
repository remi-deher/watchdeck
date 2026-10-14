<template>
  <ClientsVerdict/>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-clients><DownloadClientsList/></template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import { Download } from '@lucide/vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import ClientsVerdict from './connections/ClientsVerdict.vue';
import DownloadClientsList from './connections/DownloadClientsList.vue';

const page = useSettingsPage();
const sections = [
  { key: 'clients', title: 'Clients de téléchargement direct', description: 'Reçoivent une release choisie à la main dans la recherche Prowlarr.', icon: Download, keywords: ['qbittorrent', 'transmission', 'sabnzbd', 'client', 'torrent'] },
];
</script>
