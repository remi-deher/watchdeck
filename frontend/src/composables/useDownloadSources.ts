import { ref, type Ref } from 'vue';
import { api } from '@/api';
import type { TorrentClientInfo } from '@/types/downloads';

const arrInstances = ref<any[]>([]);
const downloadClients = ref<TorrentClientInfo[]>([]);
const loading = ref(true);
const error = ref('');
let pending: Promise<void> | null = null;
let loadedAt = 0;

/**
 * Une reponse mal formee ne doit pas se propager en liste.
 *
 * Les consommateurs -- palette de commandes en tete -- appellent directement
 * `.filter()` sur ces refs, comme le type le leur promet. Laisser passer un objet
 * faisait lever une TypeError a l'interieur d'un `computed`, ce qui interrompt le
 * cycle de rendu de Vue : le shell entier restait alors a moitie rendu, sans que rien
 * a l'ecran n'indique la cause.
 */
function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function useDownloadSources() {
  async function load({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (pending) return pending;
    if (!force && loadedAt && Date.now() - loadedAt < 5000) return;
    loading.value = true;
    pending = Promise.allSettled([api<any[]>('/api/arr-instances'), api<TorrentClientInfo[]>('/api/download-clients')])
      .then((results) => {
        const failures: string[] = [];
        if (results[0].status === 'fulfilled') arrInstances.value = asList(results[0].value);
        else failures.push(`Instances *Arr : ${(results[0] as PromiseRejectedResult).reason?.message}`);
        if (results[1].status === 'fulfilled') downloadClients.value = asList<TorrentClientInfo>(results[1].value);
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
