<template>
  <!-- Contenu de la section TMDB : activation, cle, region, et le test a cote des champs. -->
  <ConfigureField label="Activer TMDB" help="Fiches, affiches et suggestions de Découvrir.">
    <ToggleSwitch v-model="form.tmdb_enabled" label="Activer TMDB" />
  </ConfigureField>
  <SecretField v-model="form.tmdb_api_key" label="Clé TMDB" hint="Clé API (v3) gratuite, à générer sur themoviedb.org dans Paramètres → API." :configured="Boolean(secretsPresent.tmdb_api_key)" />
  <UiField :error="validationErrors.tmdb_region" label="Région de découverte" hint="Code pays ISO 3166-1 (ex. FR) utilisé pour les dates de sortie, les plateformes et les tendances." v-slot="field"><input :id="field.id" v-model="form.tmdb_region" maxlength="2" placeholder="FR" :aria-describedby="field.describedBy" @input="form.tmdb_region = form.tmdb_region.toUpperCase()"></UiField>
  <ConfigureTest :result="shown" :testing="testing" label="Tester TMDB" @test="testTmdb" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { api } from '@/api';
import { form, secretsPresent, success, fail, validationErrors } from '@/settingsForm';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import ConfigureTest from '@/components/templates/configure/ConfigureTest.vue';
import SecretField from '@/components/ui/SecretField.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiField from '@/components/ui/UiField.vue';
import { useConnectionTest } from '@/composables/useConnectionTest';
import { testResultOf, useConnectionsStatus } from './connectionsStatus';

/* L'état réel lu par la zone (`useConnectionsStatus`) tient lieu de dernier résultat de test :
   ce que le service a répondu, pas seulement s'il est configuré. */
const connections = useConnectionsStatus();
const shown = computed(() => testResultOf(connections.rowFor('tmdb')));

const { testing, run: testTmdb } = useConnectionTest(
  () => api('/api/test/tmdb', { method: 'POST', body: JSON.stringify({ tmdb_api_key: form.tmdb_api_key }) }),
  {
    onSuccess: (data: any) => { success(data.message || 'Connexion valide.'); connections.refreshAll().catch(() => {}); },
    onError: (error) => { fail(error); connections.refreshAll().catch(() => {}); },
  }
);
</script>
