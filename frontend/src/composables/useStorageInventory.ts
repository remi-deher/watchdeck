/* Inventaire des medias : ce que Plex et Arr ont observe, par paquets de cent (defilement
   continu). La source se filtre cote serveur, la presence et la recherche sur ce qui est
   charge. Une observation Plex peut etre actualisee depuis sa fiche. */
import { computed, ref, type Ref } from 'vue';
import { api } from '@/api';
import { chipsFromGroups, type FilterGroupDefinition } from '@/composables/useFiltersDrawer';

const PAGE = 100;

export interface InventoryRow {
  id: number;
  source: 'plex' | 'arr';
  present: boolean;
  observed_at: string;
  data: Record<string, any>;
}

const toDate = (value: string) => new Date(value.endsWith('Z') ? value : `${value}Z`);

export function useStorageInventory(query: Ref<string>) {
  const rows = ref<InventoryRow[]>([]);
  const source = ref('');
  const presence = ref('');
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref('');
  const hasMore = ref(false);
  const refreshing = ref(0);
  const selectedId = ref<number | null>(null);

  const visible = computed(() => {
    const needle = query.value.trim().toLowerCase();
    return rows.value.filter((row) => (presence.value === '' || (presence.value === 'present') === row.present)
      && (!needle || [row.data.title, row.data.path, ...(row.data.files || []).map((file: any) => file.path)].filter(Boolean).join(' ').toLowerCase().includes(needle)));
  });
  const selected = computed(() => rows.value.find((row) => row.id === selectedId.value) || null);

  /** Lit un paquet : `more` ajoute a la suite, sinon on repart du debut. */
  async function load(more = false): Promise<void> {
    if (loading.value || loadingMore.value) return;
    if (more) loadingMore.value = true; else loading.value = true;
    error.value = '';
    try {
      const offset = more ? rows.value.length : 0;
      const page = await api<InventoryRow[]>(`/api/storage/inventory?offset=${offset}&limit=${PAGE}${source.value ? `&source=${source.value}` : ''}`);
      rows.value = more ? [...rows.value, ...page] : page;
      hasMore.value = page.length >= PAGE;
    } catch (cause: any) {
      error.value = cause.message;
    } finally {
      loading.value = false;
      loadingMore.value = false;
    }
  }

  async function refreshRow(id: number): Promise<void> {
    refreshing.value = id;
    try {
      await api(`/api/storage/inventory/${id}/refresh`, { method: 'POST' });
      await load(false);
    } finally {
      refreshing.value = 0;
    }
  }

  const groups = computed<FilterGroupDefinition[]>(() => [
    {
      key: 'source', label: 'Source', value: source.value, fallback: '',
      options: [{ value: '', label: 'Toutes les sources' }, { value: 'plex', label: 'Plex' }, { value: 'arr', label: 'Sonarr / Radarr' }],
      set: (value) => { source.value = value; void load(false); },
    },
    {
      key: 'presence', label: 'Présence', value: presence.value, fallback: '',
      options: [{ value: '', label: 'Toutes' }, { value: 'present', label: 'Observées' }, { value: 'absent', label: 'Absentes du dernier catalogue' }],
      set: (value) => { presence.value = value; },
    },
  ]);
  const chips = computed(() => chipsFromGroups(groups.value));
  const filterCount = computed(() => chips.value.length);

  function reset(): void {
    presence.value = '';
    if (source.value) { source.value = ''; void load(false); }
  }

  return { rows, visible, selected, selectedId, loading, loadingMore, error, hasMore, refreshing, groups, chips, filterCount, load, refreshRow, reset, toDate };
}
