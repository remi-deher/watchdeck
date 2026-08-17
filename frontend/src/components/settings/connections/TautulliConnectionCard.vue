<template>
  <SettingsCard title="Import historique Tautulli" subtitle="Source facultative pour rapatrier manuellement les anciennes lectures" :icon="History" :status="form.tautulli_enabled ? 'active' : 'inactive'" :default-open="form.tautulli_enabled">
    <template #actions>
      <ToggleSwitch v-model="form.tautulli_enabled" :label="form.tautulli_enabled ? 'Activé' : 'Désactivé'"/>
    </template>
    <div class="settings-grid two">
      <label class="span-two">URL Tautulli<input v-model.trim="form.tautulli_url" type="url" placeholder="http://tautulli:8181"><small>Adresse de ton instance Tautulli, ex. http://tautulli:8181 en Docker.</small></label>
      <label class="span-two">Clé API<input v-model="form.tautulli_api_key" type="password" :placeholder="secretsPresent.tautulli_api_key?'Clé configurée':'Clé API Tautulli'"><small>Disponible dans Tautulli sous Réglages -&gt; Web Interface -&gt; API.</small></label>
    </div>
    <p class="connection-result">
      <strong>Importer</strong> récupère les sessions passées depuis Tautulli (jusqu'à la limite choisie).
      <strong>Normaliser l'historique</strong> recalcule la décision de lecture, la progression et le temps regardé des sessions déjà importées.
      Aucun import automatique n’est effectué : Tautulli reste une source historique manuelle et facultative.
    </p>
    <div class="card-actions">
      <button class="secondary" :disabled="busy" @click="testConnection"><PlugZap/>Tester</button>
      <select v-model.number="importLength"><option :value="500">500 sessions</option><option :value="2000">2 000 sessions</option><option :value="10000">Tout (10 000 max.)</option></select>
      <button class="secondary" :disabled="busy" @click="runImport"><History/>Importer</button>
      <button class="secondary" :disabled="busy" @click="normalizeHistory"><RefreshCw/>Normaliser l'historique</button>
    </div>
    <p v-if="status" class="connection-result">{{ status }}</p>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)"/>
  </SettingsCard>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { History, PlugZap, RefreshCw } from '@lucide/vue';
import { api } from '@/api';
import { form, save, secretsPresent } from '@/settingsForm';
import ConfirmModal from '@/components/ConfirmModal.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { useConfirm } from '@/composables/useConfirm';
import SettingsCard from '../SettingsCard.vue';

const busy=ref(false),status=ref(''),importLength=ref(2000);
const {dialog:confirmDialog,askConfirm,resolveConfirm}=useConfirm();
async function testConnection(): Promise<void> {
  busy.value=true;status.value='';
  try{await save();const result=await api('/api/playback/tautulli/test',{method:'POST'});status.value=result.message}
  catch(error: any){status.value=error.message}
  finally{busy.value=false}
}
async function runImport(): Promise<void> {
  busy.value=true;status.value='';
  try{await save();const result=await api('/api/playback/tautulli/import',{method:'POST',body:JSON.stringify({length:importLength.value})});status.value=`${result.imported} session(s) importée(s) sur ${result.received}.`}
  catch(error: any){status.value=error.message}
  finally{busy.value=false}
}
async function normalizeHistory(): Promise<void> {
  if(!await askConfirm({
    title:"Normaliser l'historique Tautulli ?",
    message:"Les décisions de lecture, la progression et le temps regardé des anciennes sessions seront recalculés depuis Tautulli.",
    confirmLabel:"Normaliser",
  }))return;
  busy.value=true;status.value='';
  try{
    await save();
    const result=await api('/api/playback/tautulli/normalize',{method:'POST',body:JSON.stringify({length:10000})});
    status.value=`${result.normalized} session(s) corrigée(s) sur ${result.matched} retrouvée(s).`;
  }catch(error: any){status.value=error.message}
  finally{busy.value=false}
}
</script>

<style scoped lang="scss">
.card-actions{display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center;margin-top:4px}.card-actions select{width:auto}.connection-result{margin:0;color:var(--muted);font-size:var(--fs-sm);line-height:1.5}@media(max-width:640px){.card-actions{display:grid;grid-template-columns:1fr 1fr}.card-actions>*{width:100%!important;min-height:44px}}@media(max-width:420px){.card-actions{grid-template-columns:1fr}}
</style>
