<template>
  <!-- Serveurs Plex suivis par la Bibliotheque : le principal (carte Plex ci-dessus) et
       les serveurs supplementaires (4K, famille...). Un media present sur plusieurs
       serveurs reste une seule fiche. -->
  <CrudResourceCard
    title="Serveurs Plex"
    :subtitle="subtitle"
    :icon="Server"
    :items="serverList"
    :columns="columns"
    empty-label="Aucun serveur configuré."
    add-label="Ajouter un serveur"
    has-test
    locked-key="is_primary"
    @open-modal="openSheet"
    @toggle="toggleServer"
    @remove="removeServer"
    @test="testServer"
  >
    <template #col-name="{ item }">
      <strong>{{ item.name }}</strong>
      <small v-if="item.is_primary">Principal</small>
    </template>
    <template #col-url="{ item }">{{ item.url || 'Non configuré' }}</template>
    <template #col-location_count="{ item }">{{ item.location_count }}</template>
  </CrudResourceCard>

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMutation } from '@tanstack/vue-query';
import { Server } from '@lucide/vue';
import { api } from '@/api';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { success, fail } from '@/settingsForm';
import CrudResourceCard from '../CrudResourceCard.vue';
import ConfirmModal from '../../ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useCrudResource } from '@/composables/useCrudResource';

const columns = [
  { key: 'name', label: 'Nom', isTitle: true },
  { key: 'url', label: 'Adresse', class: 'url-cell' },
  { key: 'location_count', label: 'Médias' },
  { key: 'enabled', label: 'Statut', isStatus: true },
];

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const { items: servers, toggle, remove } = useCrudResource('/api/plex-servers', {}, {
  confirmTitle: 'Supprimer ce serveur ?',
  confirmMessage: (name: string) => `${name} ne sera plus synchronisé. Les médias présents uniquement sur ce serveur disparaîtront de la Bibliothèque au prochain scan complet.`,
});
// Liste absente ou reponse inattendue (backend injoignable) : la carte s'affiche quand meme.
const serverList = computed<any[]>(() => (Array.isArray(servers.value) ? servers.value : []));
const subtitle = computed(() => {
  const extra = serverList.value.filter((s: any) => !s.is_primary).length;
  return extra ? `Principal + ${extra} serveur(s) supplémentaire(s)` : 'Ajoutez un serveur 4K ou familial : ses médias rejoignent la Bibliothèque.';
});

function guardPrimary(server: any): boolean {
  if (!server.is_primary) return false;
  fail(new Error('Le serveur principal se configure dans la carte Plex.'));
  return true;
}
async function toggleServer(server: any): Promise<void> {
  if (guardPrimary(server)) return;
  try { await toggle(server); } catch (e) { fail(e); }
}
async function removeServer(server: any): Promise<void> {
  if (guardPrimary(server)) return;
  try { await remove(server, askConfirm); } catch (e) { fail(e); }
}

/* Ajout et modification se font dans la feuille, a leur propre adresse. */
const route = useRoute();
const router = useRouter();
function openSheet(server?: any): void {
  ouvrirFiche(router, `/settings/resource/plex-server/${server?.id ?? 'new'}`, route.fullPath);
}

const testMutation = useMutation({
  mutationFn: (server: any) => api<any>('/api/test/plex-server', { method: 'POST', body: JSON.stringify({ id: server.id }) }),
  retry: 0,
});
async function testServer(server: any): Promise<void> {
  try {
    const data = await testMutation.mutateAsync(server);
    if (data.success) success(data.message || 'Serveur joignable.');
    else fail(new Error(data.message || 'Connexion impossible.'));
  } catch (e) { fail(e); }
}
</script>
