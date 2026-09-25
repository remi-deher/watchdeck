<template>
  <!-- Fiche d'un torrent, dans la feuille depuis le tableau des clients, ou en pleine page
       par son adresse. Les actions sont executees ici, comme depuis le tableau. -->
  <SheetPage
    eyebrow="Client torrent"
    :title="torrent?.title || 'Torrent'"
    :subtitle="torrent?.client_name"
    :loading="clientsQuery.isPending.value"
    :error="erreur"
  >
    <TorrentInspector
      v-if="torrent"
      :torrent="torrent"
      :busy="isBusy(torrent)"
      @action="(action) => runAction(action, [torrent])"
      @meta="metaTargets = [torrent]"
      @remove="removalOpen = true"
      @error="showError"
    />
  </SheetPage>

  <TorrentMetaModal :targets="metaTargets" :busy="busy" @close="metaTargets = null" @save="saveMetadata" />

  <ModalShell :open="removalOpen" title="Supprimer ce torrent" subtitle="Choisis si les données téléchargées doivent être conservées." @close="removalOpen = false">
    <p><strong>{{ torrent?.title }}</strong></p>
    <p class="removal-warning">La suppression des fichiers est définitive et peut retirer des médias encore utilisés ailleurs.</p>
    <template #actions>
      <UiButton :disabled="busy" @click="removalOpen = false">Annuler</UiButton>
      <UiButton variant="danger" :disabled="busy" @click="remove(false)"><Trash2 />Retirer seulement</UiButton>
      <UiButton variant="danger" :disabled="busy" @click="remove(true)"><FileX2 />Supprimer avec les fichiers</UiButton>
    </template>
  </ModalShell>
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { FileX2, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { useConfirm } from '@/composables/useConfirm';
import { useMediaOverlay } from '@/composables/useMediaOverlay';
import { useToast } from '@/composables/useToast';
import { torrentKey, useTorrentActions } from '@/composables/useTorrentActions';
import ConfirmModal from '@/components/ConfirmModal.vue';
import SheetPage from '@/components/layout/SheetPage.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import TorrentInspector from '@/components/downloads/TorrentInspector.vue';
import TorrentMetaModal from '@/components/downloads/TorrentMetaModal.vue';

const route = useRoute();
const router = useRouter();
const { actif: enSurface, fermer } = useMediaOverlay();
const { addToast } = useToast();

/* Meme lecture -- et meme cache -- que la page Acquisition : ouverte depuis le tableau,
   la fiche s'affiche aussitot, sans nouvel aller-retour. */
const clientsQuery = useQuery({
  queryKey: ['downloads', 'clients'],
  queryFn: ({ signal }) => api<any[]>('/api/downloads/clients', { signal }),
  select: (rows) => (Array.isArray(rows) ? rows : []),
  staleTime: 5_000,
});
const cle = computed(() => `${route.params.clientId}:${route.params.hash}`);
const torrent = computed(() => (clientsQuery.data.value || []).find((row: any) => torrentKey(row) === cle.value) || null);
const erreur = computed(() => {
  if (clientsQuery.error.value) return 'Les clients torrent n’ont pas pu être lus.';
  if (clientsQuery.isSuccess.value && !torrent.value) return 'Ce torrent n’existe plus dans le client.';
  return '';
});
useRealtime(['download.updated'], () => void clientsQuery.refetch(), { debounceMs: 350 });

function showError(message: string): void {
  addToast({ type: 'error', title: 'Torrent', message });
}

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const { busy, isBusy, runAction, saveMetadata: saveTorrentMetadata, confirmRemoval } = useTorrentActions({
  onDone: () => void clientsQuery.refetch(),
  onError: showError,
  askConfirm,
});

const metaTargets = ref<any[] | null>(null);
async function saveMetadata(category: string, tags: string): Promise<void> {
  await saveTorrentMetadata(metaTargets.value || [], category, tags);
  metaTargets.value = null;
}

const removalOpen = ref(false);
/* Un torrent retire n'a plus de fiche : on referme, et l'on retrouve le tableau. */
async function remove(deleteFiles: boolean): Promise<void> {
  removalOpen.value = false;
  if (!torrent.value) return;
  const removed = await confirmRemoval([torrent.value], deleteFiles);
  if (!removed.size) return;
  if (enSurface.value) fermer();
  else void router.push({ path: '/downloads', query: { view: 'clients', sub: 'instances' } });
}
</script>

<style scoped>
.removal-warning{color: var(--red-text)}
</style>
