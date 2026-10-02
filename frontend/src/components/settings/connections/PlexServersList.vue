<template>
  <!-- Serveurs Plex suivis par la Bibliotheque : le principal, dont la connexion vit dans
       les reglages generaux et s'ouvre dans le volet, puis les serveurs supplementaires
       (4K, famille...), chacun dans sa feuille. Un media present sur plusieurs serveurs
       reste une seule fiche. -->
  <SettingsItemList title="Serveurs Plex" :subtitle="subtitle" :count="serverList.length || null">
    <template #actions>
      <UiButton @click="openSheet()"><Plus />Ajouter un serveur</UiButton>
    </template>

    <PlexConnectionItem :name="primary?.name || 'Plex'" :summary="primary ? serverSummary(primary) : ''" />
    <SettingsItem
      v-for="server in extraServers"
      :key="server.id"
      :title="server.name"
      :subtitle="serverSummary(server)"
      :icon="Server"
      :status="server.enabled ? 'active' : 'inactive'"
      clickable
      @open="openSheet(server)"
    >
      <template #actions>
        <UiButton size="sm" icon-only title="Tester" aria-label="Tester" @click="testServer(server)"><PlugZap /></UiButton>
        <UiButton size="sm" icon-only :title="server.enabled ? 'Désactiver' : 'Activer'" :aria-label="server.enabled ? 'Désactiver' : 'Activer'" @click="toggleServer(server)"><Power /></UiButton>
        <UiButton size="sm" variant="danger" icon-only title="Supprimer" aria-label="Supprimer" @click="removeServer(server)"><Trash2 /></UiButton>
      </template>
    </SettingsItem>
  </SettingsItemList>

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMutation } from '@tanstack/vue-query';
import { Plus, PlugZap, Power, Server, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { success, fail } from '@/settingsForm';
import UiButton from '@/components/ui/UiButton.vue';
import SettingsItem from '../SettingsItem.vue';
import SettingsItemList from '../SettingsItemList.vue';
import PlexConnectionItem from './PlexConnectionItem.vue';
import ConfirmModal from '../../ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useCrudResource } from '@/composables/useCrudResource';

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const { items: servers, toggle, remove } = useCrudResource('/api/plex-servers', {}, {
  confirmTitle: 'Supprimer ce serveur ?',
  confirmMessage: (name: string) => `${name} ne sera plus synchronisé. Les médias présents uniquement sur ce serveur disparaîtront de la Bibliothèque au prochain scan complet.`,
});
// Liste absente ou reponse inattendue (backend injoignable) : la liste s'affiche quand meme.
const serverList = computed<any[]>(() => (Array.isArray(servers.value) ? servers.value : []));
const primary = computed<any | null>(() => serverList.value.find((s: any) => s.is_primary) || null);
const extraServers = computed<any[]>(() => serverList.value.filter((s: any) => !s.is_primary));
function serverSummary(server: any): string {
  const parts = [server.url || 'Non configuré'];
  if (server.location_count != null) parts.push(`${server.location_count} média(s)`);
  return parts.join(' · ');
}
const subtitle = computed(() => {
  const extra = serverList.value.filter((s: any) => !s.is_primary).length;
  return extra ? `Principal + ${extra} serveur(s) supplémentaire(s)` : 'Ajoutez un serveur 4K ou familial : ses médias rejoignent la Bibliothèque.';
});

function guardPrimary(server: any): boolean {
  if (!server.is_primary) return false;
  fail(new Error('Le serveur principal se configure dans sa ligne, en tête de liste.'));
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
