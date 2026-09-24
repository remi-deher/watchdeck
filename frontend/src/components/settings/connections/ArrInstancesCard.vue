<template>
  <CrudResourceCard
    title="Instances Sonarr, Radarr et Prowlarr"
    :subtitle="`${arrInstances.length} instance(s) configurée(s)`"
    :icon="ServerCog"
    :items="arrInstances"
    :columns="columns"
    empty-label="Aucune instance configurée."
    add-label="Ajouter"
    @open-modal="openSheet"
    @toggle="toggleArr"
    @remove="removeArr"
    @test="testArr"
  />

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { useMutation } from '@tanstack/vue-query';
import { ServerCog } from '@lucide/vue';
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

const arrDefaults = { name: '', arr_type: 'sonarr', url: '', api_key: '', quality_profile_id: null, root_folder: '', minimum_availability: 'released', is_default: false, enabled: true, indexer_ids: null };
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const { items: arrInstances, toggle: toggleArr, remove } = useCrudResource('/api/arr-instances', arrDefaults, {
  confirmTitle: 'Supprimer cette instance ?',
});
function removeArr(instance: any): Promise<void> { return remove(instance, askConfirm); }

/* Ajout et modification se font dans la feuille, a leur propre adresse. */
const route = useRoute();
const router = useRouter();
function openSheet(instance?: any): void {
  ouvrirFiche(router, `/settings/resource/arr/${instance?.id ?? 'new'}`, route.fullPath);
}

const testArrMutation = useMutation({
  mutationFn: (instance: any) => api<any>('/api/test/arr-instance', { method: 'POST', body: JSON.stringify({ url: instance.url, api_key: instance.api_key, arr_type: instance.arr_type }) }),
  retry: 0,
});

async function testArr(instance: any): Promise<void> {
  try {
    const data = await testArrMutation.mutateAsync(instance);
    success(data.message || 'Instance joignable.');
  } catch (e) { fail(e); }
}

</script>
