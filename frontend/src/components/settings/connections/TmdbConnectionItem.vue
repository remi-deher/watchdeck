<template>
  <SettingsItem
    title="TMDB"
    :subtitle="live.status === 'error' ? live.detail : [baseSubtitle, live.detail].filter(Boolean).join(' · ')"
    :icon="Clapperboard"
    :status="live.status === 'neutral' ? (form.tmdb_enabled ? 'active' : 'inactive') : live.status"
    :status-text="live.text || (form.tmdb_enabled ? 'Activé' : 'Désactivé')"
    keywords="clé api région themoviedb"
    saveable
  >
    <template #actions>
      <ConnectionTestAction :loading="testing" :disabled="!form.tmdb_enabled" @test="testTmdb" />
    </template>
    <UiCheckboxField v-model="form.tmdb_enabled" label="Activer TMDB" />
    <SecretField v-model="form.tmdb_api_key" label="Clé TMDB" hint="Clé API (v3) gratuite, à générer sur themoviedb.org dans Paramètres → API." :configured="Boolean(secretsPresent.tmdb_api_key)" />
    <UiField :error="validationErrors.tmdb_region" label="Région de découverte" hint="Code pays ISO 3166-1 (ex. FR) utilisé pour les dates de sortie, les plateformes et les tendances." v-slot="field"><input :id="field.id" v-model="form.tmdb_region" maxlength="2" placeholder="FR" :aria-describedby="field.describedBy" @input="form.tmdb_region = form.tmdb_region.toUpperCase()"></UiField>
  </SettingsItem>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import { Clapperboard } from '@lucide/vue';
import { api } from '@/api';
import { form, secretsPresent, success, fail, validationErrors } from '@/settingsForm';
import SecretField from '@/components/ui/SecretField.vue';
import SettingsItem from '../SettingsItem.vue';
import { useConnectionsStatus } from './connectionsStatus';
import UiField from '@/components/ui/UiField.vue';
import ConnectionTestAction from './ConnectionTestAction.vue';
import { useConnectionTest } from '@/composables/useConnectionTest';

/* État réel lu par la zone (`useConnectionsStatus`) : la ligne dit ce que le service
   a répondu, plus seulement s'il est configuré. */
const connections = useConnectionsStatus();
const live = computed(() => connections.rowFor('tmdb'));
const baseSubtitle = computed(() => `Fiches, affiches et suggestions de Découvrir${form.tmdb_region ? ` · région ${form.tmdb_region}` : ''}`);


const { testing, run: testTmdb } = useConnectionTest(
  () => api('/api/test/tmdb', { method: 'POST', body: JSON.stringify({ tmdb_api_key: form.tmdb_api_key }) }),
  {
    // Le résultat reste sur la ligne : l'état de la zone est relu après le test.
    onSuccess: (data) => { success(data.message || 'Connexion valide.'); connections.refreshAll().catch(() => {}); },
    onError: (error) => { fail(error); connections.refreshAll().catch(() => {}); },
  }
);
</script>
