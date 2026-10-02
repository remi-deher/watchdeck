import { ref, shallowRef } from 'vue';
import { api } from '@/api';

const PAGE_SIZE = 100;

function asList<T>(value: unknown): T[] { return Array.isArray(value) ? (value as T[]) : []; }

/**
 * Historique des telechargements, pagine. Chaque rechargement complet invalide les
 * lectures en vol : une reponse arrivee apres un changement de filtre est ignoree.
 */
export function useDownloadHistory(
  filters: () => { source: string; instanceId: string; sort?: string; direction?: string },
  setError: (message: string) => void,
) {
  const history = shallowRef<any[]>([]);
  const errors = ref<any[]>([]);
  const loading = ref(false);
  const hasMore = ref(false);
  let version = 0;

  function url(offset: number): string {
    const { source, instanceId, sort, direction } = filters();
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (source) params.set('source', source);
    if (instanceId) params.set('instance_id', instanceId);
    // Le tri est fait par le serveur, sur tout l'historique : « Afficher plus » suit l'ordre.
    if (sort) params.set('sort', sort);
    if (direction) params.set('direction', direction);
    return `/api/downloads/history?${params}`;
  }

  async function fetchPage(offset: number, append: boolean, showLoading: boolean): Promise<void> {
    const loadVersion = version;
    const target = url(offset);
    if (showLoading) loading.value = true;
    try {
      const payload = await api(target);
      if (loadVersion !== version) return;
      const rows = asList<any>(payload?.items || payload);
      history.value = append ? [...history.value, ...rows] : rows;
      errors.value = payload.errors || [];
      hasMore.value = rows.length === PAGE_SIZE;
      setError('');
    } catch (e: any) {
      if (loadVersion === version) setError(`Historique : ${e.message}`);
    } finally {
      if (loadVersion === version) loading.value = false;
    }
  }

  async function load(): Promise<void> {
    version++;
    // Le voile ne s'affiche que sans liste : un rafraichissement ne fait pas clignoter.
    await fetchPage(0, false, !history.value.length);
  }

  async function loadMore(): Promise<void> {
    if (loading.value || !hasMore.value) return;
    await fetchPage(history.value.length, true, true);
  }

  function reset(): void { hasMore.value = false; }

  return { history, errors, loading, hasMore, load, loadMore, reset };
}
