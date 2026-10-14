<template>
  <!-- Contenu de la section Seer (Overseerr ou Jellyseerr, facultatif). -->
  <ConfigureField label="Activer Seer" help="Overseerr ou Jellyseerr, facultatif.">
    <ToggleSwitch v-model="form.seer_enabled" label="Activer Seer" />
  </ConfigureField>
  <UiField label="URL Seer" v-slot="field"><input :id="field.id" v-model="form.seer_url" type="url" placeholder="http://seer:5055" :aria-describedby="field.describedBy"></UiField>
  <SecretField v-model="form.seer_api_key" label="Clé API Seer" hint="Disponible dans Overseerr/Jellyseerr sous Réglages → Général → API Key." :configured="Boolean(secretsPresent.seer_api_key)" />
  <template v-if="form.seer_enabled">
    <ConfigureField label="Mode" :help="form.seer_mode === 'actor'
      ? 'Seer traite aussi les demandes.'
      : 'Les demandes sont toujours traitées par Sonarr/Radarr/Prowlarr ; Seer n’est consulté qu’en lecture (synchronisation, statut affiché). Une panne de Seer n’a aucun impact.'">
      <UiSelect v-model="form.seer_mode" aria-label="Mode" :options="[{ value: 'observer', label: 'Observateur' }, { value: 'actor', label: 'Acteur' }]" />
    </ConfigureField>
    <template v-if="form.seer_mode === 'actor'">
      <ConfigureField label="Repli direct Sonarr/Radarr" help="Si l’envoi vers Seer échoue, la demande est quand même transmise directement à Sonarr/Radarr/Prowlarr plutôt que d’échouer.">
        <ToggleSwitch v-model="form.seer_fallback_arr" label="Repli direct Sonarr/Radarr" />
      </ConfigureField>
      <ConfigureField label="Laisser Seer gérer les emails de demande" help="Actif : les utilisateurs actifs sur Seer sont ignorés par Watchdeck (Seer gère leurs demandes et notifications). Inactif : Watchdeck les traite et les notifie aussi, en parallèle de Seer.">
        <ToggleSwitch v-model="form.seer_suppress_notifications" label="Laisser Seer gérer les emails de demande" />
      </ConfigureField>
    </template>
  </template>
  <ConfigureTest :result="shown" :testing="testing" label="Tester Seer" @test="testSeer" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { api } from '@/api';
import { form, secretsPresent, success, fail } from '@/settingsForm';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import ConfigureTest from '@/components/templates/configure/ConfigureTest.vue';
import SecretField from '@/components/ui/SecretField.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiField from '@/components/ui/UiField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import { useConnectionTest } from '@/composables/useConnectionTest';
import { testResultOf, useConnectionsStatus } from './connectionsStatus';

/* L'état réel lu par la zone (`useConnectionsStatus`) tient lieu de dernier résultat de test. */
const connections = useConnectionsStatus();
const shown = computed(() => testResultOf(connections.rowFor('seer')));

const { testing, run: testSeer } = useConnectionTest(
  () => api('/api/test/seer', { method: 'POST', body: JSON.stringify({ seer_url: form.seer_url, seer_api_key: form.seer_api_key }) }),
  {
    onSuccess: (data: any) => { success(data.message || 'Connexion valide.'); connections.refreshAll().catch(() => {}); },
    onError: (error) => { fail(error); connections.refreshAll().catch(() => {}); },
  }
);
</script>
