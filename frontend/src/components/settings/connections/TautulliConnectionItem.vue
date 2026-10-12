<template>
  <!-- Contenu de la section Tautulli : source historique manuelle et facultative. -->
  <ConfigureField label="Activer Tautulli" help="Source facultative pour rapatrier manuellement les anciennes lectures.">
    <ToggleSwitch v-model="form.tautulli_enabled" label="Activer Tautulli" />
  </ConfigureField>
  <UiField label="URL Tautulli" hint="Adresse de votre instance Tautulli, ex. http://tautulli:8181 en Docker." v-slot="field"><input :id="field.id" v-model.trim="form.tautulli_url" type="url" placeholder="http://tautulli:8181" :aria-describedby="field.describedBy"></UiField>
  <SecretField v-model="form.tautulli_api_key" label="Clé API" hint="Disponible dans Tautulli sous Réglages → Web Interface → API." :configured="Boolean(secretsPresent.tautulli_api_key)" />
  <ConfigureTest :result="shown" :testing="busy" label="Tester Tautulli" @test="testConnection" />

  <ConfigureField label="Importer l’historique" help="Importer récupère les sessions passées depuis Tautulli (jusqu’à la limite choisie). Normaliser recalcule la décision de lecture, la progression et le temps regardé des sessions déjà importées. Aucun import automatique : Tautulli reste une source historique manuelle. Ce Tautulli suit le serveur Plex principal ; celui d’un serveur supplémentaire se règle dans sa fiche, et l’import les parcourt tous." stacked>
    <UiSelect v-model="importLength" aria-label="Nombre de sessions" :options="[{ value: 500, label: '500 sessions' }, { value: 2000, label: '2 000 sessions' }, { value: 10000, label: 'Tout (10 000 max.)' }]" />
    <UiButton :disabled="busy" @click="runImport"><History />Importer</UiButton>
    <UiButton :disabled="busy" @click="normalizeHistory"><RefreshCw />Normaliser l'historique</UiButton>
  </ConfigureField>
  <p v-if="status" class="connection-result" role="status">{{ status }}</p>
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { computed, ref } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { History, RefreshCw } from '@lucide/vue';
import { api } from '@/api';
import { form, save, secretsPresent } from '@/settingsForm';
import SecretField from '@/components/ui/SecretField.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { useConfirm } from '@/composables/useConfirm';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import ConfigureTest from '@/components/templates/configure/ConfigureTest.vue';
import UiField from '@/components/ui/UiField.vue';
import { testResultOf, useConnectionsStatus } from './connectionsStatus';

/* L'état réel lu par la zone (`useConnectionsStatus`) tient lieu de dernier résultat de test. */
const connections = useConnectionsStatus();
const live = computed(() => testResultOf(connections.rowFor('tautulli')));
const testResult = ref<{ ok: boolean; message: string } | null>(null);
const shown = computed(() => testResult.value || live.value);

const status=ref(''),importLength=ref(2000);
const {dialog:confirmDialog,askConfirm,resolveConfirm}=useConfirm();
const tautulliMutation = useMutation({
  mutationFn: async ({ path, body }: { path: string; body?: any }) => {
    await save();
    return api<any>(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
  },
  retry: 0,
});
const busy = computed(() => tautulliMutation.isPending.value);
async function testConnection(): Promise<void> {
  status.value='';
  try{const result=await tautulliMutation.mutateAsync({path:'/api/playback/tautulli/test'});testResult.value={ok:true,message:result.message}}
  catch(error: any){testResult.value={ok:false,message:error.message}}
}
async function runImport(): Promise<void> {
  status.value='';
  try{const result=await tautulliMutation.mutateAsync({path:'/api/playback/tautulli/import',body:{length:importLength.value}});status.value=`${result.imported} session(s) importée(s) sur ${result.received}.`}
  catch(error: any){status.value=error.message}
}
async function normalizeHistory(): Promise<void> {
  if(!await askConfirm({
    title:"Normaliser l'historique Tautulli ?",
    message:"Les décisions de lecture, la progression et le temps regardé des anciennes sessions seront recalculés depuis Tautulli.",
    confirmLabel:"Normaliser",
  }))return;
  status.value='';
  try{
    const result=await tautulliMutation.mutateAsync({path:'/api/playback/tautulli/normalize',body:{length:10000}});
    status.value=`${result.normalized} session(s) corrigée(s) sur ${result.matched} retrouvée(s).`;
  }catch(error: any){status.value=error.message}
}
</script>

<style scoped>
.connection-result{margin:0;color:var(--muted);font-size:var(--fs-sm);line-height:1.5}
</style>
