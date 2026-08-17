<template>
  <CrudResourceCard
    title="Clients de téléchargement direct"
    subtitle="Clients configurés — utilisés pour pousser une release choisie manuellement via la recherche Prowlarr"
    :icon="Download"
    :items="clients"
    :columns="columns"
    empty-label="Aucun client configuré."
    add-label="Ajouter"
    :show-modal="showClientModal"
    :editing-id="editingClientId"
    create-title="Ajouter un client"
    update-title="Modifier le client"
    modal-class="arr-instance-modal"
    :can-save="Boolean(clientForm.name && clientForm.url)"
    @open-modal="openClientModal"
    @close-modal="closeClientModal"
    @save="saveClient"
    @toggle="toggleClient"
    @remove="removeClient"
    @test="testClient"
  >
    <template #form>
      <label>Nom<input v-model="clientForm.name"></label>
      <label>Type
        <select v-model="clientForm.client_type">
          <option value="qbittorrent">qBittorrent</option>
          <option value="transmission">Transmission</option>
          <option value="deluge">Deluge</option>
        </select>
      </label>
      <label>URL<input v-model="clientForm.url" type="url"></label>
      <label>Utilisateur <small>(facultatif)</small>
        <input v-model="clientForm.username" autocomplete="username">
        <small>Laisser vide si le client autorise Watchdeck par adresse IP ou sous-réseau.</small>
      </label>
      <label>Mot de passe <small>(facultatif)</small>
        <input v-model="clientForm.password" type="password" autocomplete="current-password">
      </label>
      <label>Catégorie
        <input v-model="clientForm.category">
        <small>Catégorie appliquée aux torrents envoyés, pour les retrouver facilement dans le client.</small>
      </label>
      <label>Tags
        <input v-model="clientForm.tags">
        <small>Tags séparés par des virgules, appliqués aux torrents envoyés depuis Watchdeck.</small>
      </label>
      <label class="check"><input v-model="clientForm.is_default" type="checkbox"> Client par défaut</label>
      <small class="check-hint">Client présélectionné quand plusieurs sont configurés et qu'aucun n'est explicitement choisi lors d'un envoi manuel.</small>
    </template>

    <template #modal-actions>
      <ConnectionTestAction :loading="testing" :disabled="!clientForm.url" label="Tester la connexion" @test="testClient()" />
    </template>
  </CrudResourceCard>

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { Download } from '@lucide/vue';
import { api } from '@/api';
import CrudResourceCard from '../CrudResourceCard.vue';
import ConfirmModal from '../../ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useCrudResource } from '@/composables/useCrudResource';
import { success, fail } from '@/settingsForm';
import ConnectionTestAction from './ConnectionTestAction.vue';
import { useConnectionTest } from '@/composables/useConnectionTest';

const columns = [
  { key: 'name', label: 'Nom', isTitle: true },
  { key: 'client_type', label: 'Type', isBadge: true },
  { key: 'url', label: 'Adresse', class: 'url-cell' },
  { key: 'enabled', label: 'Statut', isStatus: true },
];

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const clientDefaults = { name: '', client_type: 'qbittorrent', url: '', username: '', password: '', category: '', tags: '', is_default: false, enabled: true };

const {
  items: clients,
  editingId: editingClientId,
  showModal: showClientModal,
  form: clientForm,
  load: loadClients,
  openModal: openClientModal,
  closeModal: closeClientModal,
  save: saveClient,
  toggle: toggleClient,
  remove,
} = useCrudResource('/api/download-clients', clientDefaults, {
  created: 'Client enregistré.',
  confirmTitle: 'Supprimer ce client ?',
});

function removeClient(client: any): Promise<void> { return remove(client, askConfirm); }

const { testing, run: runClientTest } = useConnectionTest(async (client: any = clientForm) => {
    const data = await api('/api/test/download-client', { method: 'POST', body: JSON.stringify(client) });
    if (!data.success) throw new Error(data.message || 'Connexion impossible.');
    return data;
  }, {
    onSuccess: data => success(data.message || 'Client joignable.'),
    onError: fail,
  });

async function testClient(client: any = clientForm): Promise<void> {
  await runClientTest(client);
}

onMounted(loadClients);
</script>
