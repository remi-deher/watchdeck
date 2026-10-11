<template>
  <ConnectionsVerdict/>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-info>
      <SettingsItemList>
        <TmdbConnectionItem/>
        <SeerConnectionItem/>
      </SettingsItemList>
    </template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import { Info } from '@lucide/vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import SettingsItemList from './SettingsItemList.vue';
import ConnectionsVerdict from './connections/ConnectionsVerdict.vue';
import SeerConnectionItem from './connections/SeerConnectionItem.vue';
import TmdbConnectionItem from './connections/TmdbConnectionItem.vue';

const page = useSettingsPage();
const sections = [
  { key: 'info', title: 'Informations', description: 'Métadonnées et demandes externes. Ouvrez une ligne pour la configurer.', icon: Info, keywords: ['tmdb', 'seerr', 'overseerr', 'métadonnées'] },
];
</script>
