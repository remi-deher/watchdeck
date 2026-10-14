<template>
  <!-- Contenu de la section du serveur Plex principal : adresse, jeton (ou connexion SSO),
       Universal Watchlist, certificat. Le test lit la configuration enregistree. -->
  <UiField :error="validationErrors.plex_url" label="URL" hint="Adresse locale de votre serveur Plex (pas app.plex.tv), ex. http://192.168.1.10:32400 ou http://plex:32400 en Docker." v-slot="field"><input :id="field.id" v-model="form.plex_url" type="url" placeholder="http://plex:32400" :aria-describedby="field.describedBy"></UiField>
  <SecretField v-model="form.plex_token" label="Token" hint="Jeton d'authentification Plex (X-Plex-Token). Le plus simple est d'utiliser la connexion Plex SSO, qui le récupère automatiquement." :configured="Boolean(secretsPresent.plex_token)" />
  <ConfigureField label="Connexion Plex SSO" help="Ouvre plex.tv pour autoriser Watchdeck ; le jeton est récupéré automatiquement.">
    <UiButton @click="startPlexSso"><LogIn />Connexion Plex SSO</UiButton>
  </ConfigureField>
  <ConfigureTest :result="shown" :testing="testingPlex" label="Tester Plex" @test="testPlex" />
  <UiField label="URL Universal Watchlist" hint="Agrège la watchlist de tous vos amis Plex sans qu'ils aient besoin de se connecter à Watchdeck. Nécessite Plex Pass." v-slot="field"><input :id="field.id" v-model="form.plex_rss_url" type="url" placeholder="https://rss.plex.tv/..." :aria-describedby="field.describedBy"></UiField>
  <ConfigureTest :testing="testingWatchlist" label="Tester l'Universal Watchlist" @test="testWatchlist" />
  <ConfigureField label="Vérifier le certificat TLS" help="Désactiver seulement pour un certificat auto-signé sur le réseau local.">
    <ToggleSwitch v-model="form.plex_verify_ssl" label="Vérifier le certificat TLS" />
  </ConfigureField>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { LogIn } from '@lucide/vue';
import { api } from '@/api';
import { form, load, secretsPresent, success, fail, testSaved, validationErrors } from '@/settingsForm';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import ConfigureTest from '@/components/templates/configure/ConfigureTest.vue';
import SecretField from '@/components/ui/SecretField.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import { useConnectionTest } from '@/composables/useConnectionTest';
import { testResultOf, useConnectionsStatus } from './connectionsStatus';

/* L'état réel lu par la zone (`useConnectionsStatus`) tient lieu de dernier résultat de test. */
const connections = useConnectionsStatus();
const shown = computed(() => testResultOf(connections.rowFor('plex')));

const { testing: testingPlex, run: testPlex } = useConnectionTest(async () => { const result = await testSaved('/api/test/plex-api'); connections.refreshAll().catch(() => {}); return result; });
const { testing: testingWatchlist, run: testWatchlist } = useConnectionTest(() => testSaved('/api/test/plex-rss'));

async function startPlexSso(): Promise<void> {
  try {
    const data = await api('/api/plex/sso/pin', { method: 'POST' });
    window.open(data.auth_url || data.url, '_blank', 'noopener');
    const timer = setInterval(async () => {
      const state = await api(`/api/plex/sso/check/${data.id}`).catch(() => null);
      if (state?.authenticated || state?.token) {
        clearInterval(timer);
        success('Connexion Plex terminée.');
        await load();
      }
    }, 2000);
    setTimeout(() => clearInterval(timer), 180000);
  } catch (e) { fail(e); }
}
</script>
