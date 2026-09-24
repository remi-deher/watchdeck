<template>
  <!-- Instance Sonarr, Radarr ou Prowlarr, dans la feuille ouverte depuis Integrations. -->
  <UiFeedback v-if="notFound" type="error" message="Cette instance n’existe plus." />
  <form v-else class="compact-form" @submit.prevent="enregistrer">
    <UiFeedback v-if="error" type="error" :message="error" />
    <label>Nom<input v-model="form.name"></label>
    <label>Type
      <UiSelect v-model="form.arr_type" :options="[{ value: 'sonarr', label: 'Sonarr' }, { value: 'radarr', label: 'Radarr' }, { value: 'prowlarr', label: 'Prowlarr' }]" />
    </label>
    <label>URL<input v-model="form.url" type="url"></label>
    <label>Clé API
      <input v-model="form.api_key" type="password">
      <small>Disponible dans Sonarr/Radarr/Prowlarr sous Réglages -> Général -> Clé API.</small>
    </label>
    <label>Profil
      <UiSelect v-model="form.quality_profile_id" :options="[{ value: null, label: 'Par défaut' }, ...profiles.map((profile: any) => ({ value: profile.id, label: String(profile.name) }))]" />
    </label>
    <label>Dossier racine
      <UiSelect v-model="form.root_folder" :options="[{ value: '', label: 'Par défaut' }, ...folders.map((folder: any) => ({ value: folder.path || folder, label: String(folder.path || folder) }))]" />
    </label>
    <small class="check-hint">Renseigne URL et Clé API puis clique « Charger profils et dossiers » pour remplir les deux listes ci-dessus depuis cette instance.</small>
    <UiCheckboxField v-model="form.is_default" label="Instance par défaut" />
    <small class="check-hint">Instance utilisée par défaut pour ce type (Sonarr/Radarr) quand plusieurs sont configurées et qu'aucune n'est explicitement choisie pour une demande.</small>

    <div class="form-actions">
      <UiButton @click="loadOptions"><ListRestart />Charger profils et dossiers</UiButton>
      <ConnectionTestAction :loading="testing" :disabled="!form.url || !form.api_key" label="Tester" @test="test" />
      <UiButton @click="emit('cancel')">Annuler</UiButton>
      <UiButton variant="primary" type="submit" :loading="saving" :disabled="!form.name || !form.url || !form.api_key"><Save />{{ creating ? 'Ajouter' : 'Mettre à jour' }}</UiButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { ListRestart, Save } from '@lucide/vue';
import { api } from '@/api';
import { useCrudResource } from '@/composables/useCrudResource';
import { useResourceForm } from '@/composables/useResourceForm';
import { useToast } from '@/composables/useToast';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import ConnectionTestAction from '../connections/ConnectionTestAction.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ (e: 'done', message: string): void; (e: 'cancel'): void }>();

const defaults = { name: '', arr_type: 'sonarr', url: '', api_key: '', quality_profile_id: null, root_folder: '', minimum_availability: 'released', is_default: false, enabled: true, indexer_ids: null };
const crud = useCrudResource<any>('/api/arr-instances', defaults);
const form = crud.form;
const { creating, item, notFound, error, saving, submit } = useResourceForm(crud, toRef(props, 'id'));
const { addToast } = useToast();

async function enregistrer(): Promise<void> {
  if (await submit()) emit('done', creating.value ? 'Instance ajoutée.' : 'Instance mise à jour.');
}

const profiles = ref<any[]>([]), folders = ref<any[]>([]);
async function loadOptions(): Promise<void> {
  if (form.arr_type === 'prowlarr') { profiles.value = []; folders.value = []; return; }
  const q = !creating.value ? `?instance_id=${props.id}` : `?url=${encodeURIComponent(form.url)}&api_key=${encodeURIComponent(form.api_key)}`;
  [profiles.value, folders.value] = await Promise.all([
    api<any[]>(`/api/${form.arr_type}/profiles${q}`).catch(() => []),
    api<any[]>(`/api/${form.arr_type}/folders${q}`).catch(() => []),
  ]);
}
// Une instance existante : ses listes sont lues des qu'elle est chargee.
watch(item, (value) => { if (value) void loadOptions(); }, { immediate: true });

const testMutation = useMutation({
  mutationFn: () => api<any>('/api/test/arr-instance', { method: 'POST', body: JSON.stringify({ url: form.url, api_key: form.api_key, arr_type: form.arr_type }) }),
  retry: 0,
});
const testing = computed(() => testMutation.isPending.value);
async function test(): Promise<void> {
  try {
    const data = await testMutation.mutateAsync();
    addToast({ type: 'success', title: 'Connexion', message: data.message || 'Instance joignable.' });
  } catch (e) { error.value = humanizeError(e); }
}
</script>

<style scoped>
.form-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-2)}
</style>
