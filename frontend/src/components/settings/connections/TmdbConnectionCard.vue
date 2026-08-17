<template>
  <SettingsCard title="TMDB" subtitle="Fournit les fiches, affiches et suggestions de l'onglet Découvrir." :icon="Clapperboard" :status="form.tmdb_enabled ? 'active' : 'inactive'" :default-open="form.tmdb_enabled">
    <template #actions>
      <ConnectionTestAction :loading="testing" :disabled="!form.tmdb_enabled" @test="testTmdb" />
    </template>
    <label class="check"><input v-model="form.tmdb_enabled" type="checkbox"> Activer TMDB</label>
    <UiField label="Clé TMDB" hint="Clé API (v3) gratuite, à générer sur themoviedb.org dans Paramètres → API." v-slot="field"><input :id="field.id" v-model="form.tmdb_api_key" type="password" placeholder="Laisser vide pour conserver" :aria-describedby="field.describedBy"></UiField>
    <UiField label="Région de découverte" hint="Code pays ISO 3166-1 (ex. FR) utilisé pour les dates de sortie, les plateformes et les tendances." v-slot="field"><input :id="field.id" v-model="form.tmdb_region" maxlength="2" placeholder="FR" :aria-describedby="field.describedBy" @input="form.tmdb_region = form.tmdb_region.toUpperCase()"></UiField>
  </SettingsCard>
</template>

<script setup lang="ts">
import { Clapperboard } from '@lucide/vue';
import { api } from '@/api';
import { form, success, fail } from '@/settingsForm';
import SettingsCard from '../SettingsCard.vue';
import UiField from '@/components/ui/UiField.vue';
import ConnectionTestAction from './ConnectionTestAction.vue';
import { useConnectionTest } from '@/composables/useConnectionTest';

const { testing, run: testTmdb } = useConnectionTest(
  () => api('/api/test/tmdb', { method: 'POST', body: JSON.stringify({ tmdb_api_key: form.tmdb_api_key }) }),
  { onSuccess: data => success(data.message || 'Connexion valide.'), onError: fail }
);
</script>
