<template>
  <!-- Cadre commun des pages Encodage, sur le socle des gabarits (PageTemplate) : les vues
       d'un groupe en onglets (la seule rangee d'onglets), la barre de commande FileFlows en
       outil de page, et les etats communs -- FileFlows non branche, injoignable, connexion.
       Recherche, filtres et autres emplacements passent tels quels au socle. -->
  <PageTemplate
    v-bind="$attrs"
    :title="title"
    :tabs="tabs"
    :active-tab="route.path"
    tabs-label="Vues de l’encodage"
    :state="state"
    :error="status?.connected === false ? `FileFlows ne répond pas : ${status.error || 'connexion impossible'}` : ''"
    loading-message="Connexion à FileFlows…"
    :unconfigured="UNCONFIGURED"
    @retry="statusQuery.refetch()"
  >
    <template #tools><EncodingCommandBar compact /></template>
    <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope || {}" /></template>
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Cpu } from '@lucide/vue';
import { useFileflowsStatus } from '@/composables/useFileflows';
import PageTemplate, { type PageState } from '@/components/templates/PageTemplate.vue';
import type { SubnavItem } from '@/components/ui/AppSubnav.vue';
import EncodingCommandBar from './EncodingCommandBar.vue';

defineOptions({ inheritAttrs: false });
defineProps<{ title: string }>();

const UNCONFIGURED = {
  title: 'FileFlows n’est pas branché',
  message: 'Ajoutez votre serveur FileFlows pour suivre et piloter les traitements.',
  icon: Cpu,
  actionTo: '/settings/services/media',
  actionLabel: 'Configurer FileFlows',
};

/* Les vues d'une meme entree du menu : Traitements (suivre, comprendre, analyser) et
   Configuration (bibliotheques, flows, reglages). La Vue d'ensemble est seule. */
const GROUPS: SubnavItem[][] = [
  [
    { key: '/encoding/queue', label: 'File', to: '/encoding/queue' },
    { key: '/encoding/history', label: 'Historique', to: '/encoding/history' },
    { key: '/encoding/stats', label: 'Statistiques', to: '/encoding/stats' },
  ],
  [
    { key: '/encoding/libraries', label: 'Bibliothèques', to: '/encoding/libraries' },
    { key: '/encoding/flows', label: 'Flows', to: '/encoding/flows' },
    { key: '/encoding/settings', label: 'Réglages', to: '/encoding/settings' },
  ],
];
const route = useRoute();
const tabs = computed(() => GROUPS.find((group) => group.some((item) => item.key === route.path)) || []);

const { query: statusQuery, status } = useFileflowsStatus();
const state = computed<PageState>(() => {
  if (!status.value) return 'loading';
  if (!status.value.configured) return 'unconfigured';
  if (status.value.connected === false) return 'error';
  return 'ready';
});
</script>
