/* Ce que la page Stockage lit : emplacements, taches de transfert, acces, connexions,
   instances. Le dernier etat connu s'affiche aussitot (cache local), le serveur le met a jour
   derriere ; la relecture de fond se fait toutes les cinq secondes tant que la page est
   visible, et des qu'un evenement `storage.updated` arrive. */
import { onMounted, onUnmounted, ref } from 'vue';
import { api } from '@/api';
import { readCache, writeCache } from '@/cache';
import { useRealtime } from '@/events';

const CACHE_KEY = 'storage-overview';
const POLL_MS = 5000;

export function useStorageOverview(onTick?: () => void) {
  const locations = ref<any[]>([]);
  const jobs = ref<any[]>([]);
  const accesses = ref<any[]>([]);
  const connections = ref<any[]>([]);
  const instances = ref<any[]>([]);
  const loading = ref(false);
  const error = ref('');

  const cached = readCache<any>(CACHE_KEY, { maxAgeMs: 30 * 60_000 });
  if (cached) {
    locations.value = cached.locations || [];
    jobs.value = cached.jobs || [];
    accesses.value = cached.accesses || [];
    connections.value = cached.connections || [];
    instances.value = cached.instances || [];
  }

  /* On ne remplace une liste que si elle a change : les lignes affichees gardent leur identite. */
  const assign = (target: { value: any[] }, next: any[]) => { if (JSON.stringify(target.value) !== JSON.stringify(next)) target.value = next; };

  async function load(silent = false): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    try {
      const [nextLocations, nextJobs, nextAccesses, nextConnections, nextInstances] = await Promise.all([
        api<any[]>('/api/storage/locations'), api<any[]>('/api/storage/transfers'), api<any[]>('/api/storage/accesses'),
        api<any[]>('/api/storage/connections'), api<any[]>('/api/storage/instances'),
      ]);
      assign(connections, nextConnections);
      assign(accesses, nextAccesses);
      assign(instances, nextInstances);
      assign(locations, nextLocations);
      assign(jobs, nextJobs);
      writeCache(CACHE_KEY, { locations: nextLocations, jobs: nextJobs, accesses: nextAccesses, connections: nextConnections, instances: nextInstances });
    } catch (cause: any) {
      if (!silent) error.value = cause.message;
    } finally {
      loading.value = false;
    }
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  const background = () => {
    if (document.hidden) return;
    void load(true);
    onTick?.();
  };
  onMounted(() => { timer = setInterval(background, POLL_MS); document.addEventListener('visibilitychange', background); });
  onUnmounted(() => { if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', background); });
  useRealtime(['storage.updated'], () => void load(true), { debounceMs: 600 });

  return { locations, jobs, accesses, connections, instances, loading, error, load };
}
