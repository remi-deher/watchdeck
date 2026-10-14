<template>
  <!-- Le verdict de la zone d'abord, puis une section par intention : serveurs, sources d'activité
       en direct, et réglages de collecte. -->
  <ConnectionsVerdict/>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-plex><PlexConnectionItem/></template>
    <template #section-servers><PlexServersList/></template>
    <template #section-tracearr><TracearrConnectionItem/></template>
    <template #section-tautulli><TautulliConnectionItem/></template>
    <template #section-collection><PlexActivitySection/></template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import { DatabaseZap, History, Server, Sparkles } from '@lucide/vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import ConnectionsVerdict from './connections/ConnectionsVerdict.vue';
import PlexConnectionItem from './connections/PlexConnectionItem.vue';
import PlexServersList from './connections/PlexServersList.vue';
import PlexActivitySection from './connections/PlexActivitySection.vue';
import TautulliConnectionItem from './connections/TautulliConnectionItem.vue';
import TracearrConnectionItem from './connections/TracearrConnectionItem.vue';

const page = useSettingsPage();
const sections = [
  { key: 'plex', title: 'Serveur Plex principal', description: 'Adresse, jeton, Universal Watchlist et certificat : requis pour la Bibliothèque, les demandes et l\'analyse VF.', icon: Server, keywords: ['plex', 'url', 'token', 'jeton', 'universal watchlist', 'rss', 'sso', 'certificat', 'tls'] },
  { key: 'servers', title: 'Serveurs Plex supplémentaires', description: 'Un serveur 4K ou familial : ses médias rejoignent la Bibliothèque.', icon: Server, keywords: ['plex', '4k', 'serveur', 'url'] },
  { key: 'tracearr', title: 'Enrichissement Tracearr', description: 'Complète les lectures dont Plex n\'a pas conservé la décision.', icon: Sparkles, keywords: ['tracearr', 'url', 'clé api', 'enrichir', 'import', 'lectures'] },
  { key: 'tautulli', title: 'Import historique Tautulli', description: 'Source facultative pour rapatrier manuellement les anciennes lectures.', icon: History, keywords: ['tautulli', 'url', 'clé api', 'importer', 'normaliser', 'historique', 'sessions'] },
  { key: 'collection', title: 'Activité Plex', description: 'Collecte des lectures directement depuis Plex. Elle ne dépend pas de Tautulli.', icon: DatabaseZap, keywords: ['collecte', 'anonymiser', 'ip', 'historique', 'lieux'] },
];
</script>
