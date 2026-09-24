<template>
  <CrudResourceCard
    title="Clients de téléchargement direct"
    subtitle="Clients configurés — utilisés pour pousser une release choisie manuellement via la recherche Prowlarr"
    :icon="Download"
    :items="clients"
    :columns="columns"
    empty-label="Aucun client configuré."
    add-label="Ajouter"
    @open-modal="openSheet"
    @toggle="toggleClient"
    @remove="removeClient"
    @test="testClient"
  />

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { useMutation } from '@tanstack/vue-query';
import { Download } from '@lucide/vue';
import { api } from '@/api';
import CrudResourceCard from '../CrudResourceCard.vue';
import ConfirmModal from '../../ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useCrudResource } from '@/composables/useCrudResource';
import { success, fail } from '@/settingsForm';

const columns = [
  { key: 'name', label: 'Nom', isTitle: true },
  { key: 'client_type', label: 'Type', isBadge: true },
  { key: 'url', label: 'Adresse', class: 'url-cell' },
  { key: 'enabled', label: 'Statut', isStatus: true },
];

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const clientDefaults = { name: '', client_type: 'qbittorrent', url: '', username: '', password: '', category: '', tags: '', is_default: false, enabled: true };

const { items: clients, toggle: toggleClient, remove } = useCrudResource('/api/download-clients', clientDefaults, {
  confirmTitle: 'Supprimer ce client ?',
});

/* Ajout et modification se font dans la feuille, a leur propre adresse. */
const route = useRoute();
const router = useRouter();
function openSheet(client?: any): void {
  ouvrirFiche(router, `/settings/resource/download-client/${client?.id ?? 'new'}`, route.fullPath);
}
function removeClient(client: any): Promise<void> { return remove(client, askConfirm); }

const testClientMutation = useMutation({
  mutationFn: async (client: any) => {
    const data = await api('/api/test/download-client', { method: 'POST', body: JSON.stringify(client) });
    if (!data.success) throw new Error(data.message || 'Connexion impossible.');
    return data;
  },
  retry: 0,
});

async function testClient(client: any): Promise<void> {
  try {
    const data = await testClientMutation.mutateAsync(client);
    success(data.message || 'Client joignable.');
  } catch (error) { fail(error); }
}

</script>
