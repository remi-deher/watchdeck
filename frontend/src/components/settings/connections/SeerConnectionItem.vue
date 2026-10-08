<template>
  <SettingsItem
    title="Seer"
    :subtitle="live.status === 'error' ? live.detail : [baseSubtitle, live.detail].filter(Boolean).join(' · ')"
    :icon="Radar"
    :status="live.status === 'neutral' ? (form.seer_enabled ? 'active' : 'inactive') : live.status"
    :status-text="live.text || (form.seer_enabled ? 'Activé' : form.seer_url ? 'Désactivé' : 'Non configuré')"
    keywords="overseerr jellyseerr url clé api mode observateur acteur"
    saveable
  >
    <template #actions>
      <ConnectionTestAction :loading="testing" :disabled="!form.seer_enabled" @test="testSeer" />
    </template>
    <UiCheckboxField v-model="form.seer_enabled" label="Activer Seer" />
    <label>URL Seer<input v-model="form.seer_url" type="url" placeholder="http://seer:5055"></label>
    <SecretField v-model="form.seer_api_key" label="Clé API Seer" hint="Disponible dans Overseerr/Jellyseerr sous Réglages → Général → API Key." :configured="Boolean(secretsPresent.seer_api_key)" />
    <template v-if="form.seer_enabled">
      <label>Mode
        <UiSelect v-model="form.seer_mode" :options="[{ value: 'observer', label: 'Observateur — Seer n\'est qu\'une source d\'information' }, { value: 'actor', label: 'Acteur — Seer traite aussi les demandes' }]" />
      </label>
      <p class="hint" v-if="form.seer_mode !== 'actor'">
        Les demandes sont toujours traitées par Sonarr/Radarr/Prowlarr ; Seer n'est consulté qu'en lecture
        (synchronisation, statut affiché). Une panne de Seer n'a aucun impact.
      </p>
      <template v-if="form.seer_mode === 'actor'">
        <UiCheckboxField v-model="form.seer_fallback_arr" label="Repli direct Sonarr/Radarr" />
        <small class="check-hint">Si l'envoi vers Seer échoue, la demande est quand même transmise directement à Sonarr/Radarr/Prowlarr plutôt que d'echouer.</small>
        <UiCheckboxField v-model="form.seer_suppress_notifications" label="Laisser Plex-RSS gerer les emails de demande pour les utilisateurs Seer" />
        <small class="check-hint">Actif par défaut : les utilisateurs actifs sur Seer sont ignorés par Watchdeck (Seer gère leurs demandes et notifications). Desactive : Watchdeck traite et notifie aussi ces utilisateurs en parallele de Seer.</small>
      </template>
    </template>
  </SettingsItem>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import { Radar } from '@lucide/vue';
import { api } from '@/api';
import { form, secretsPresent, success, fail } from '@/settingsForm';
import SecretField from '@/components/ui/SecretField.vue';
import SettingsItem from '../SettingsItem.vue';
import { useConnectionsStatus } from './connectionsStatus';
import ConnectionTestAction from './ConnectionTestAction.vue';
import { useConnectionTest } from '@/composables/useConnectionTest';

/* État réel lu par la zone (`useConnectionsStatus`) : la ligne dit ce que le service
   a répondu, plus seulement s'il est configuré. */
const connections = useConnectionsStatus();
const live = computed(() => connections.rowFor('seer'));
const baseSubtitle = computed(() => form.seer_enabled ? `Overseerr ou Jellyseerr · ${form.seer_mode === 'actor' ? 'acteur' : 'observateur'}` : 'Overseerr ou Jellyseerr, facultatif');


const { testing, run: testSeer } = useConnectionTest(
  () => api('/api/test/seer', { method: 'POST', body: JSON.stringify({ seer_url: form.seer_url, seer_api_key: form.seer_api_key }) }),
  {
    // Le résultat reste sur la ligne : l'état de la zone est relu après le test.
    onSuccess: (data) => { success(data.message || 'Connexion valide.'); connections.refreshAll().catch(() => {}); },
    onError: (error) => { fail(error); connections.refreshAll().catch(() => {}); },
  }
);
</script>
