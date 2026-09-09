<template>
  <SettingsCard
    title="Enrichissement Tracearr"
    subtitle="Complète les lectures dont Plex n’a pas conservé la décision"
    :icon="Sparkles"
    :status="form.tracearr_enabled ? 'active' : 'inactive'"
    :default-open="form.tracearr_enabled"
  >
    <template #actions>
      <ToggleSwitch v-model="form.tracearr_enabled" :label="form.tracearr_enabled ? 'Activé' : 'Désactivé'"/>
    </template>

    <div class="settings-grid two">
      <label class="span-two">URL Tracearr
        <input v-model.trim="form.tracearr_url" type="url" placeholder="https://tracearr.exemple.net">
        <small>Adresse de ton instance, sans le chemin d’API : Watchdeck ajoute lui-même <code>/api/v2/public</code>.</small>
      </label>
      <label class="span-two">Clé API
        <input v-model="form.tracearr_api_key" type="password" :placeholder="secretsPresent.tracearr_api_key ? 'Clé configurée' : 'trr_pub_…'">
        <small>À générer dans Tracearr sous Réglages &gt; Général. Lecture seule, format <code>trr_pub_…</code>.</small>
      </label>
    </div>

    <!-- Le « pourquoi » compte autant que le « comment » ici : sans cette explication, on
         ne comprend pas pourquoi une source tierce répare des chiffres venus de Plex. -->
    <p class="connection-result">
      Plex ne conserve la décision de lecture (directe, remux, transcodage) que pendant la session vivante :
      une lecture terminée avant que Watchdeck ne l’observe reste <strong>inconnue</strong> pour toujours.
      Tracearr, lui, enregistre chaque session au moment où elle se produit — <strong>y compris celles qui n’ont
      jamais été terminées</strong>, que l’historique Plex ignore complètement.
      L’import <strong>ne remplace rien</strong> : il ne remplit que les champs manquants, et signale les désaccords
      au lieu de les trancher en silence.
    </p>

    <div class="card-actions">
      <button class="secondary" :disabled="busy" @click="testConnection"><PlugZap/>Tester</button>
      <select v-model.number="importDays">
        <option :value="30">30 derniers jours</option>
        <option :value="90">90 derniers jours</option>
        <option :value="365">1 an</option>
        <option :value="0">Tout l’historique</option>
      </select>
      <button class="secondary" :disabled="busy" @click="runImport"><Sparkles/>Enrichir</button>
    </div>

    <p v-if="status" class="connection-result">{{ status }}</p>
  </SettingsCard>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { PlugZap, Sparkles } from '@lucide/vue';
import { api } from '@/api';
import { form, save, secretsPresent } from '@/settingsForm';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import SettingsCard from '../SettingsCard.vue';

const busy = ref(false);
const status = ref('');
const importDays = ref(90);

async function testConnection(): Promise<void> {
  busy.value = true;
  status.value = '';
  try {
    await save();
    const result = await api<{ message: string }>('/api/playback/tracearr/test', { method: 'POST' });
    status.value = result.message;
  } catch (error: any) {
    status.value = error.message;
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
