<template>
  <!-- Contenu de la section Tracearr : activation, adresse, cle, test, puis l'enrichissement. -->
  <ConfigureField label="Activer l’enrichissement" help="Complète les lectures dont Plex n’a pas conservé la décision.">
    <ToggleSwitch v-model="form.tracearr_enabled" label="Activer Tracearr" />
  </ConfigureField>
  <UiField label="URL Tracearr" hint="Adresse de votre instance, sans le chemin d’API : Watchdeck ajoute lui-même /api/v2/public." v-slot="field"><input :id="field.id" v-model.trim="form.tracearr_url" type="url" placeholder="https://tracearr.exemple.net" :aria-describedby="field.describedBy"></UiField>
  <SecretField v-model="form.tracearr_api_key" label="Clé API" hint="À générer dans Tracearr sous Réglages > Général. Lecture seule, format trr_pub_…" :configured="Boolean(secretsPresent.tracearr_api_key)" />
  <ConfigureTest :result="shown" :testing="busy" label="Tester Tracearr" @test="testConnection" />

  <!-- Le « pourquoi » compte autant que le « comment » ici : sans cette explication, on
       ne comprend pas pourquoi une source tierce répare des chiffres venus de Plex. -->
  <ConfigureField label="Enrichir l’historique" help="Plex ne conserve la décision de lecture (directe, remux, transcodage) que pendant la session vivante : une lecture terminée avant que Watchdeck ne l’observe reste inconnue pour toujours. Tracearr enregistre chaque session au moment où elle se produit, y compris celles qui n’ont jamais été terminées. L’import ne remplace rien : il ne remplit que les champs manquants, et signale les désaccords au lieu de les trancher en silence." stacked>
    <UiSelect v-model="importDays" aria-label="Période à enrichir" :options="[{ value: 30, label: '30 derniers jours' }, { value: 90, label: '90 derniers jours' }, { value: 365, label: '1 an' }, { value: 0, label: 'Tout l’historique' }]" />
    <UiButton :disabled="busy" @click="runImport"><Sparkles />Enrichir</UiButton>
  </ConfigureField>
  <p v-if="status" class="connection-result" role="status">{{ status }}</p>
</template>

<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { ref, computed } from 'vue';
import { Sparkles } from '@lucide/vue';
import { api } from '@/api';
import { form, save, secretsPresent } from '@/settingsForm';
import SecretField from '@/components/ui/SecretField.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import ConfigureTest from '@/components/templates/configure/ConfigureTest.vue';
import UiField from '@/components/ui/UiField.vue';
import { testResultOf, useConnectionsStatus } from './connectionsStatus';

/* L'état réel lu par la zone (`useConnectionsStatus`) tient lieu de dernier résultat de test. */
const connections = useConnectionsStatus();
const live = computed(() => testResultOf(connections.rowFor('tracearr')));
const testResult = ref<{ ok: boolean; message: string } | null>(null);
const shown = computed(() => testResult.value || live.value);

const busy = ref(false);
const status = ref('');
const importDays = ref(90);

async function testConnection(): Promise<void> {
  busy.value = true;
  status.value = '';
  try {
    await save();
    const result = await api<{ message: string }>('/api/playback/tracearr/test', { method: 'POST' });
    testResult.value = { ok: true, message: result.message };
  } catch (error: any) {
    testResult.value = { ok: false, message: error.message };
  } finally {
    busy.value = false;
  }
}

async function runImport(): Promise<void> {
  busy.value = true;
  status.value = 'Import en cours…';
  try {
    await save();
    const body = JSON.stringify(importDays.value ? { days: importDays.value } : {});
    const result = await api<{ received: number; created: number; enriched: number; conflicts: number }>(
      '/api/playback/tracearr/import',
      { method: 'POST', body }
    );
    // Créées et enrichies ne veulent pas dire la même chose : l'une signifie « Tracearr
    // connaît des lectures que nous ignorions », l'autre « il a rempli nos trous ».
    const parts = [
      `${result.received} lecture(s) lue(s)`,
      `${result.enriched} complétée(s)`,
      `${result.created} ajoutée(s)`,
    ];
    if (result.conflicts) parts.push(`${result.conflicts} désaccord(s) conservé(s) en l’état`);
    status.value = `${parts.join(' · ')}.`;
  } catch (error: any) {
    status.value = error.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.connection-result{margin:0;color:var(--muted);font-size:var(--fs-sm);line-height:1.5}
</style>
