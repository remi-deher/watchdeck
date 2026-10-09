<template>
  <!-- Cadre commun des sections Encodage : barre de commande, et a la place du contenu
       un etat explicite quand FileFlows n'est pas branche ou ne repond pas. -->
  <AppPage :title="title" page-class="encoding-page" hide-search>
    <!-- Comme les types de la Bibliotheque : les vues d'un groupe en onglets dans la
         rangee collante de la page, la seule rangee d'onglets du shell. -->
    <template v-if="tabs" #tabs>
      <AppSubnav :items="tabs" :active="route.path" aria-label="Vues de la section" />
    </template>
    <UiEmptyState v-if="status && !status.configured" title="FileFlows n'est pas branché" message="Ajoutez votre serveur FileFlows pour suivre et piloter les traitements." :icon="Cpu">
      <template #action><UiButton to="/settings/services/media" variant="primary">Configurer FileFlows</UiButton></template>
    </UiEmptyState>
    <template v-else>
      <EncodingCommandBar :compact="compact" />
      <UiFeedback v-if="status && status.connected === false" type="error" :message="`FileFlows ne répond pas : ${status.error || 'connexion impossible'}`" />
      <p v-else-if="!status" class="encoding-loading">Connexion à FileFlows…</p>
      <slot v-else />
    </template>
  </AppPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Cpu } from '@lucide/vue';
import { useFileflowsStatus } from '@/composables/useFileflows';
import AppPage from '@/components/ui/AppPage.vue';
import AppSubnav, { type SubnavItem } from '@/components/ui/AppSubnav.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import EncodingCommandBar from './EncodingCommandBar.vue';

withDefaults(defineProps<{ title: string; compact?: boolean }>(), { compact: true });
const { status } = useFileflowsStatus();

/* Le menu n'a que trois entrees : les pages d'un meme groupe se partagent ce selecteur. */
const GROUPS: SubnavItem[][] = [
  [
    { key: '/encoding/queue', label: 'File d’attente', to: '/encoding/queue' },
    { key: '/encoding/history', label: 'Historique', to: '/encoding/history' },
  ],
  [
    { key: '/encoding/libraries', label: 'Bibliothèques', to: '/encoding/libraries' },
    { key: '/encoding/flows', label: 'Flows', to: '/encoding/flows' },
    { key: '/encoding/settings', label: 'Réglages', to: '/encoding/settings' },
  ],
];
const route = useRoute();
const tabs = computed(() => GROUPS.find((group) => group.some((item) => item.key === route.path)) || null);
</script>

<style scoped lang="scss">
.encoding-loading { margin: 0; color: var(--muted); }
</style>
