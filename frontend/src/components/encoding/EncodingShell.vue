<template>
  <!-- Cadre commun des sections Encodage : barre de commande, et a la place du contenu
       un etat explicite quand FileFlows n'est pas branche ou ne repond pas. -->
  <AppPage :title="title" page-class="encoding-page" hide-search>
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
import { Cpu } from '@lucide/vue';
import { useFileflowsStatus } from '@/composables/useFileflows';
import AppPage from '@/components/ui/AppPage.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import EncodingCommandBar from './EncodingCommandBar.vue';

withDefaults(defineProps<{ title: string; compact?: boolean }>(), { compact: true });
const { status } = useFileflowsStatus();
</script>

<style scoped lang="scss">
.encoding-loading { margin: 0; color: var(--muted); }
</style>
