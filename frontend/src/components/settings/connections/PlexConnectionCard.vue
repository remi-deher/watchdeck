<template>
  <SettingsCard title="Plex" subtitle="Connexion au serveur Plex local — requise pour la bibliotheque, les demandes et la synchronisation VF." :icon="Server" :status="plexStatus" :default-open="true">
    <template #actions>
      <ConnectionTestAction :loading="testingPlex" @test="testPlex" />
    </template>
    <UiField label="URL" hint="Adresse locale de ton serveur Plex (pas app.plex.tv), ex. http://192.168.1.10:32400 ou http://plex:32400 en Docker." v-slot="field"><input :id="field.id" v-model="form.plex_url" type="url" placeholder="http://plex:32400" :aria-describedby="field.describedBy"></UiField>
    <UiField label="Token" hint="Jeton d'authentification Plex (X-Plex-Token). Le plus simple est d'utiliser Connexion Plex SSO ci-dessous, qui le récupère automatiquement." v-slot="field"><input :id="field.id" v-model="form.plex_token" type="password" placeholder="Laisser vide pour conserver" :aria-describedby="field.describedBy"></UiField>
    <UiField label="URL Universal Watchlist" hint="Agrège la watchlist de tous tes amis Plex sans qu'ils aient besoin de se connecter à Watchdeck. Nécessite Plex Pass." v-slot="field"><input :id="field.id" v-model="form.plex_rss_url" type="url" placeholder="https://rss.plex.tv/..." :aria-describedby="field.describedBy"></UiField>
    <label class="check"><input v-model="form.plex_verify_ssl" type="checkbox"> Verifier le certificat TLS</label>
    <div class="actions">
      <ConnectionTestAction :loading="testingWatchlist" label="Tester l'Universal Watchlist" @test="testWatchlist">
        <template #icon><Rss /></template>
      </ConnectionTestAction>
      <button class="secondary" @click="startPlexSso"><LogIn/>Connexion Plex SSO</button>
    </div>
  </SettingsCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { LogIn, Rss, Server } from '@lucide/vue';
import { api } from '@/api';
import { form, load, secretsPresent, success, fail, testSaved } from '@/settingsForm';
import SettingsCard from '../SettingsCard.vue';
import UiField from '@/components/ui/UiField.vue';
import ConnectionTestAction from './ConnectionTestAction.vue';
import { useConnectionTest } from '@/composables/useConnectionTest';

// secretsPresent.plex_token reflete la config reelle (persistee), contrairement a
// form.plex_token qui est toujours vide juste apres le chargement (voir settingsForm.ts).
const plexStatus = computed(() => (form.plex_url && secretsPresent.plex_token ? 'active' : 'inactive'));
const { testing: testingPlex, run: testPlex } = useConnectionTest(() => testSaved('/api/test/plex-api'));
const { testing: testingWatchlist, run: testWatchlist } = useConnectionTest(() => testSaved('/api/test/plex-rss'));

async function startPlexSso(): Promise<void> {
  try {
    const data = await api('/api/plex/sso/pin', { method: 'POST' });
    window.open(data.auth_url || data.url, '_blank', 'noopener');
    const timer = setInterval(async () => {
      const state = await api(`/api/plex/sso/check/${data.id}`).catch(() => null);
      if (state?.authenticated || state?.token) {
        clearInterval(timer);
        success('Connexion Plex terminee.');
        await load();
      }
    }, 2000);
    setTimeout(() => clearInterval(timer), 180000);
  } catch (e) { fail(e); }
}
</script>
