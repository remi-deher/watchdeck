<template>
  <SheetPage headless eyebrow="Client torrent" :title="torrent?.title || 'Torrent'" :subtitle="torrent?.client_name" :loading="clientsQuery.isPending.value" :error="erreur">
    <DetailTemplate
      v-if="torrent"
      :variant="enSurface ? 'sheet' : 'card'"
      eyebrow="Client torrent"
      :title="torrent.title"
      :icon="Download"
      :meta="[torrent.client_name, formatBytes(torrent.size)].filter(Boolean)"
      :badges="[{ key: 'etat', label: statusLabel(torrent), tone: tone(torrent) }]"
      :actions="actions"
      :tabs="inspection.tabs.value"
      :tab="inspection.tab.value"
      :facts="facts"
      @update:tab="inspection.select"
      @action="onAction"
    >
      <template v-for="name in ['general', 'files', 'trackers', 'peers']" #[`tab-${name}`] :key="name">
        <TorrentInspector
          :torrent="torrent"
          :tab="name"
          :files="inspection.files.value"
          :trackers="inspection.trackers.value"
          :peers="inspection.peers.value"
          :loading="inspection.loading.value"
          @priority="inspection.changeFilePriority"
        />
      </template>
    </DetailTemplate>
  </SheetPage>

  <CreateTemplate :open="Boolean(metaTargets)" :definition="metaDefinition" mode="edit" :values="metaValues" @close="metaTargets = null" />

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
/* Fiche d'un torrent, dans la feuille depuis le tableau des clients, ou en pleine page par
   son adresse. Les actions (en-tete de la fiche) sont executees ici, comme depuis le tableau. */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { Download, FileX2, Pause, Play, Radio, RotateCcw, Tag, Trash2 } from '@lucide/vue';
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
import DetailTemplate from '@/components/templates/DetailTemplate.vue';
import { useTorrentInspection } from '@/composables/useTorrentInspection';
import { formatBytes, isPaused, statusClass, statusLabel } from '@/downloads/torrentFormat';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import { torrentMetaEdit } from '@/creations/torrentMetadata';
import { useTorrentMetadata } from '@/composables/useTorrentMetadata';

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
  addToast({ type: 'success', message: 'Classement enregistré.' });
}
/* Même fenêtre que depuis le tableau : préremplie, avec ce que le client connaît. */
const metadata = useTorrentMetadata();
watch(metaTargets, (targets) => { if (targets?.length) void metadata.load(targets[0].client_id); });
const metaValues = computed(() => ({ category: metaTargets.value?.[0]?.category || '', tags: metaTargets.value?.[0]?.tags || '' }));
const metaDefinition = computed(() => torrentMetaEdit(metadata.of(metaTargets.value?.[0]?.client_id), metaTargets.value?.length || 0, saveMetadata));

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

const inspection = useTorrentInspection(torrent, showError);
const TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { active: 'info', complete: 'success', paused: 'warning', error: 'danger' };
const tone = (row: any) => TONES[statusClass(row)] || 'neutral';
/* La premiere action est la principale ; au-dela de trois, le reste passe dans « … ». */
const actions = computed(() => [
  isPaused(torrent.value) ? { key: 'resume', label: 'Reprendre', icon: Play, disabled: busy.value } : { key: 'pause', label: 'Mettre en pause', icon: Pause, disabled: busy.value },
  { key: 'recheck', label: 'Revérifier', icon: RotateCcw, disabled: busy.value },
  { key: 'reannounce', label: 'Réannoncer', icon: Radio, disabled: busy.value },
  { key: 'meta', label: 'Catégorie & Tags', icon: Tag, disabled: busy.value },
  { key: 'remove', label: 'Supprimer', icon: Trash2, danger: true, disabled: busy.value },
]);
/* Ce qui a ete recu, rendu et le rapport des deux : le ratio seul ne disait pas si l'on avait
   partage 10 Mo ou 10 Go. */
const facts = computed(() => [
  { label: 'Téléchargé', value: torrent.value?.downloaded != null ? formatBytes(torrent.value.downloaded) : '—' },
  { label: 'Partagé', value: torrent.value?.uploaded != null ? formatBytes(torrent.value.uploaded) : '—' },
  { label: 'Ratio', value: Number(torrent.value?.ratio || 0).toFixed(2) },
]);
function onAction(key: string): void {
  if (!torrent.value) return;
  if (key === 'meta') metaTargets.value = [torrent.value];
  else if (key === 'remove') removalOpen.value = true;
  else void runAction(key, [torrent.value]);
}
</script>

<style scoped>
.removal-warning{color: var(--red-text)}
</style>
