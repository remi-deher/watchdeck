/* Ce que la page Stockage lit : emplacements, taches de transfert, acces, connexions,
   instances. Le dernier etat connu s'affiche aussitot (cache local), le serveur le met a jour
   derriere ; la relecture de fond se fait toutes les cinq secondes tant que la page est
   visible, et des qu'un evenement `storage.updated` arrive. */
import { onMounted, onUnmounted, ref } from 'vue';
import { api } from '@/api';
import { readCache, writeCache } from '@/cache';
import { useRealtime } from '@/events';

const CACHE_KEY = 'storage-overview';
function hasListChanged(current: any[], next: any[]): boolean {
  if (current.length !== next.length) return true;
  for (let i = 0; i < current.length; i++) {
    const a = current[i];
    const b = next[i];
    if (a === b) continue;
    if (!a || !b) return true;
    if (a.id !== b.id || a.updated_at !== b.updated_at || a.status !== b.status || a.version !== b.version) return true;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return true;
    for (const key of aKeys) {
      if (a[key] !== b[key]) {
        if (typeof a[key] === 'object' && a[key] !== null && typeof b[key] === 'object' && b[key] !== null) {
          if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return true;
        } else {
          return true;
        }
      }
    }
  }
  return false;
}

const ACTIVE_POLL_MS = 5000;
const IDLE_POLL_MS = 30000;

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

  /* On ne remplace une liste que si elle a changé : les lignes affichées gardent leur identité. */
  const assign = (target: { value: any[] }, next: any[]) => {
    if (hasListChanged(target.value, next)) target.value = next;
  };

  function hasActiveJobs(): boolean {
    return jobs.value.some((j: any) => ['queued', 'running', 'finalizing'].includes(j.status));
  }

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

  let timer: ReturnType<typeof setTimeout> | undefined;
  function scheduleNext() {
    if (timer) clearTimeout(timer);
    const delay = hasActiveJobs() ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    timer = setTimeout(background, delay);
  }

  const background = async () => {
    if (document.hidden) {
      scheduleNext();
      return;
    }
    await load(true);
    onTick?.();
    scheduleNext();
  };

  const onVisibility = () => {
    if (!document.hidden) {
      void load(true);
      scheduleNext();
    }
  };

  onMounted(() => {
    scheduleNext();
    document.addEventListener('visibilitychange', onVisibility);
  });
  onUnmounted(() => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  });
  useRealtime(['storage.updated'], () => {
    void load(true);
    scheduleNext();
  }, { debounceMs: 600 });

  return { locations, jobs, accesses, connections, instances, loading, error, load };
}
