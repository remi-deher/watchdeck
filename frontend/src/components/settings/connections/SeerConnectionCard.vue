<template>
  <SettingsCard title="Seer" subtitle="Integration optionnelle avec une instance Overseerr ou Jellyseerr existante." :icon="Radar" :status="form.seer_enabled ? 'active' : 'inactive'" :default-open="form.seer_enabled">
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
        <small class="check-hint">Si l'envoi vers Seer echoue, la demande est quand meme transmise directement a Sonarr/Radarr/Prowlarr plutot que d'echouer.</small>
        <UiCheckboxField v-model="form.seer_suppress_notifications" label="Laisser Plex-RSS gerer les emails de demande pour les utilisateurs Seer" />
        <small class="check-hint">Actif par defaut : les utilisateurs actifs sur Seer sont ignores par Watchdeck (Seer gere leurs demandes et notifications). Desactive : Watchdeck traite et notifie aussi ces utilisateurs en parallele de Seer.</small>
      </template>
    </template>
  </SettingsCard>
</template>

<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import { Radar } from '@lucide/vue';
import { api } from '@/api';
import { form, secretsPresent, success, fail } from '@/settingsForm';
import SecretField from '@/components/ui/SecretField.vue';
import SettingsCard from '../SettingsCard.vue';
import ConnectionTestAction from './ConnectionTestAction.vue';
import { useConnectionTest } from '@/composables/useConnectionTest';

const { testing, run: testSeer } = useConnectionTest(
  () => api('/api/test/seer', { method: 'POST', body: JSON.stringify({ seer_url: form.seer_url, seer_api_key: form.seer_api_key }) }),
  { onSuccess: data => success(data.message || 'Connexion valide.'), onError: fail }
);
</script>
