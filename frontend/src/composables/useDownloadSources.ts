import { ref, type Ref } from 'vue';
import { api } from '@/api';
import type { TorrentClientInfo } from '@/types/downloads';

const arrInstances = ref<any[]>([]);
const downloadClients = ref<TorrentClientInfo[]>([]);
const loading = ref(true);
const error = ref('');
let pending: Promise<void> | null = null;
let loadedAt = 0;

export function useDownloadSources() {
  async function load({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (pending) return pending;
    if (!force && loadedAt && Date.now() - loadedAt < 5000) return;
    loading.value = true;
    pending = Promise.allSettled([api<any[]>('/api/arr-instances'), api<TorrentClientInfo[]>('/api/download-clients')])
      .then((results) => {
        const failures: string[] = [];
        if (results[0].status === 'fulfilled') arrInstances.value = results[0].value;
        else failures.push(`Instances *Arr : ${(results[0] as PromiseRejectedResult).reason?.message}`);
        if (results[1].status === 'fulfilled') downloadClients.value = results[1].value;
        else failures.push(`Clients torrent : ${(results[1] as PromiseRejectedResult).reason?.message}`);
        error.value = failures.join(' · ');
        loadedAt = Date.now();
      })
      .finally(() => {
        loading.value = false;
        pending = null;
      });
    return pending;
  }

  return { arrInstances, downloadClients, loading, error, load };
}
