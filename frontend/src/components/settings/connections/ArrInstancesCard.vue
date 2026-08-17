<template>
  <CrudResourceCard
    title="Instances Sonarr, Radarr et Prowlarr"
    :subtitle="`${arrInstances.length} instance(s) configurée(s)`"
    :icon="ServerCog"
    :items="arrInstances"
    :columns="columns"
    empty-label="Aucune instance configurée."
    add-label="Ajouter"
    :show-modal="showArrModal"
    :editing-id="editingArrId"
    create-title="Ajouter une instance"
    update-title="Modifier l'instance"
    modal-class="arr-instance-modal"
    :busy="busy"
    :can-save="Boolean(arrForm.name && arrForm.url && arrForm.api_key)"
    @open-modal="openArrModal"
    @close-modal="closeArrModal"
    @save="saveArr"
    @toggle="toggleArr"
    @remove="removeArr"
    @test="testArr"
  >
    <template #form>
      <label>Nom<input v-model="arrForm.name"></label>
      <label>Type
        <select v-model="arrForm.arr_type">
          <option value="sonarr">Sonarr</option>
          <option value="radarr">Radarr</option>
          <option value="prowlarr">Prowlarr</option>
        </select>
      </label>
      <label>URL<input v-model="arrForm.url" type="url"></label>
      <label>Clé API
        <input v-model="arrForm.api_key" type="password">
        <small>Disponible dans Sonarr/Radarr/Prowlarr sous Réglages -> Général -> Clé API.</small>
      </label>
      <label>Profil
        <select v-model.number="arrForm.quality_profile_id">
          <option :value="null">Par défaut</option>
          <option v-for="profile in arrProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
        </select>
      </label>
      <label>Dossier racine
        <select v-model="arrForm.root_folder">
          <option value="">Par défaut</option>
          <option v-for="folder in arrFolders" :key="folder.path||folder" :value="folder.path||folder">{{ folder.path||folder }}</option>
        </select>
      </label>
      <small class="check-hint">Renseigne URL et Clé API puis clique "Charger profils et dossiers" pour remplir les deux listes ci-dessus depuis cette instance.</small>
      <label class="check"><input v-model="arrForm.is_default" type="checkbox"> Instance par défaut</label>
      <small class="check-hint">Instance utilisée par défaut pour ce type (Sonarr/Radarr) quand plusieurs sont configurées et qu'aucune n'est explicitement choisie pour une demande.</small>
    </template>

    <template #modal-actions>
      <button class="secondary" @click="loadArrOptions"><ListRestart />Charger profils et dossiers</button>
    </template>
  </CrudResourceCard>

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ListRestart, ServerCog } from '@lucide/vue';
import { api } from '@/api';
import { success, fail } from '@/settingsForm';
import CrudResourceCard from '../CrudResourceCard.vue';
import ConfirmModal from '../../ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useCrudResource } from '@/composables/useCrudResource';

const columns = [
  { key: 'name', label: 'Nom', isTitle: true },
  { key: 'arr_type', label: 'Type', isBadge: true },
  { key: 'url', label: 'Adresse', class: 'url-cell' },
  { key: 'enabled', label: 'Statut', isStatus: true },
];

const arrProfiles = ref<any[]>([]), arrFolders = ref<any[]>([]);
const arrDefaults = { name: '', arr_type: 'sonarr', url: '', api_key: '', quality_profile_id: null, root_folder: '', minimum_availability: 'released', is_default: false, enabled: true, indexer_ids: null };
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

const {
  items: arrInstances,
  editingId: editingArrId,
  showModal: showArrModal,
  busy,
  form: arrForm,
  load: loadArr,
  openModal: openArrBaseModal,
  closeModal: closeArrBaseModal,
  save: saveArr,
  toggle: toggleArr,
  remove,
} = useCrudResource('/api/arr-instances', arrDefaults, {
  created: 'Instance ajoutée.',
  updated: 'Instance mise à jour.',
  confirmTitle: 'Supprimer cette instance ?',
});

function clearArrOptions(): void { arrProfiles.value = []; arrFolders.value = []; }
function openArrModal(instance?: any): void {
  clearArrOptions();
  openArrBaseModal(instance);
  if (instance) loadArrOptions();
}
function closeArrModal(): void { closeArrBaseModal(); clearArrOptions(); }
function removeArr(instance: any): Promise<void> { return remove(instance, askConfirm); }

async function loadArrOptions(): Promise<void> {
  if (arrForm.arr_type === 'prowlarr') { arrProfiles.value = []; arrFolders.value = []; return; }
  const q = editingArrId.value ? `?instance_id=${editingArrId.value}` : `?url=${encodeURIComponent(arrForm.url)}&api_key=${encodeURIComponent(arrForm.api_key)}`;
  [arrProfiles.value, arrFolders.value] = await Promise.all([
    api(`/api/${arrForm.arr_type}/profiles${q}`).catch(() => []),
    api(`/api/${arrForm.arr_type}/folders${q}`).catch(() => []),
  ]);
}

async function testArr(instance: any = arrForm): Promise<void> {
  try {
    const data = await api('/api/test/arr-instance', { method: 'POST', body: JSON.stringify({ url: instance.url, api_key: instance.api_key, arr_type: instance.arr_type }) });
    success(data.message || 'Instance joignable.');
  } catch (e) { fail(e); }
}

onMounted(loadArr);
</script>
