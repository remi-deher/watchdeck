import { computed, ref, watch, type Ref } from 'vue';
import { api } from '@/api';
import { useScopedRequests } from './useScopedRequests';
import type { DetailTab } from '@/components/templates/detail/types';

/**
 * Inspection d'un torrent : l'onglet courant et les listes (fichiers, trackers, paires), lues
 * a la demande aupres du client. Les listes ne sont pas demandees tant que leur onglet n'est
 * pas ouvert : leurs comptes n'apparaissent qu'une fois connus (avant, ils affichaient « 0 »
 * alors que rien n'avait ete demande).
 */
export function useTorrentInspection(torrent: Ref<any | null>, onError: (message: string) => void) {
  const { read, reset } = useScopedRequests();
  const tab = ref('general');
  const files = ref<any[]>([]);
  const trackers = ref<any[]>([]);
  const peers = ref<any[]>([]);
  const loading = ref(false);
  const loaded = ref(new Set<string>());
  const countOf = (name: string, list: any[]) => (loaded.value.has(name) ? list.length : undefined);

  const tabs = computed<DetailTab[]>(() => [
    { key: 'general', label: 'Général' },
    { key: 'files', label: 'Fichiers', count: countOf('files', files.value) },
    { key: 'trackers', label: 'Trackers', count: countOf('trackers', trackers.value) },
    { key: 'peers', label: 'Peers', count: countOf('peers', peers.value) },
  ]);

  const base = () => `/api/downloads/clients/${torrent.value?.client_id}/${torrent.value?.hash}`;

  async function select(name: string): Promise<void> {
    tab.value = name;
    if (name === 'general' || !torrent.value) return;
    const target = base();
    loading.value = true;
    try {
      if (name === 'files') files.value = await read(`${base()}/files`);
      else if (name === 'trackers') trackers.value = await read(`${base()}/trackers`);
      else if (name === 'peers') peers.value = await read(`${base()}/peers`);
      loaded.value = new Set([...loaded.value, name]);
    } catch (e: any) {
      if (e?.name !== 'AbortError') onError(e.message);
    } finally {
      if (target === base()) loading.value = false;
    }
  }

  async function changeFilePriority(fileId: number, priority: string | number): Promise<void> {
    try {
      await api(`${base()}/files/priority`, { method: 'POST', body: JSON.stringify({ file_ids: [fileId], priority: Number(priority) }) });
      await select('files');
    } catch (e: any) {
      onError(`Erreur de modification de la priorité : ${e.message}`);
    }
  }

  // Un autre torrent : on repart de l'onglet general, sans les listes du precedent.
  watch(() => `${torrent.value?.client_id}:${torrent.value?.hash}`, () => {
    reset();
    tab.value = 'general';
    files.value = [];
    trackers.value = [];
    peers.value = [];
    loaded.value = new Set();
  });

  return { tab, tabs, files, trackers, peers, loading, select, changeFilePriority };
}
