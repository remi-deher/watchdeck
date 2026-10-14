/* Correspondances Arr ↔ Plex : pour chaque dossier Sonarr / Radarr, le dossier Plex qui le
   montre. Les dossiers sont decouverts aupres des instances ; un choix modifie reste a
   enregistrer (barre commune de la page Configurer), un dossier sans stockage en recoit un. */
import { computed, ref, type Ref } from 'vue';
import { api } from '@/api';
import { rootMapping, suggestedPlex } from '@/components/storage/storageAssociations';

export interface MappingRow {
  key: string;
  arr_instance_id: number;
  instance: string;
  kind: string;
  arr_root: string;
  plex_roots: any[];
  error?: string;
}

export interface MappingGroup { id: number; name: string; kind: string; rows: MappingRow[] }
export interface MappingProgress { total: number; completed: number; current: string; saved: number; failed: number }

const rowKey = (instanceId: number, root: string) => `${instanceId}:${root}`;

export function useStorageMappings(locations: Ref<any[]>, reload: () => Promise<void>) {
  const roots = ref<any[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const pairs = ref<Record<string, string>>({});
  const progress = ref<MappingProgress>({ total: 0, completed: 0, current: '', saved: 0, failed: 0 });
  let checkedAt = 0;

  const rows = computed<MappingRow[]>(() => roots.value.flatMap((root: any) => (root.arr_roots?.length ? root.arr_roots : ['']).map((path: string) => ({
    key: rowKey(root.arr_instance_id, path), arr_instance_id: root.arr_instance_id, instance: root.name, kind: root.arr_type,
    arr_root: path, plex_roots: root.plex_roots || [], error: root.error,
  }))));

  const groups = computed<MappingGroup[]>(() => {
    const byInstance = new Map<number, MappingGroup>();
    for (const row of rows.value) {
      if (!byInstance.has(row.arr_instance_id)) byInstance.set(row.arr_instance_id, { id: row.arr_instance_id, name: row.instance, kind: row.kind, rows: [] });
      byInstance.get(row.arr_instance_id)!.rows.push(row);
    }
    return [...byInstance.values()];
  });

  /* Ce qui est enregistre : le dossier Plex du stockage reel (pas d'un stockage « virtuel » provisoire) en priorite. */
  const savedPairs = computed<Record<string, string>>(() => {
    const saved: Record<string, string> = {};
    for (const location of locations.value) {
      if (location.virtual === true) continue;
      for (const mapping of location.mappings || []) saved[rowKey(mapping.arr_instance_id, mapping.arr_root)] = JSON.stringify([mapping.plex_section_id, mapping.plex_root]);
    }
    return saved;
  });

  const dirtyRows = computed(() => rows.value.filter((row) => pairs.value[row.key] && !row.error && pairs.value[row.key] !== savedPairs.value[row.key]));
  const dirty = computed(() => dirtyRows.value.length > 0);
  const dirtyGroups = computed(() => new Set(dirtyRows.value.map((row) => row.arr_instance_id)));

  function statusOf(row: MappingRow): 'todo' | 'dirty' | 'done' {
    const choice = pairs.value[row.key];
    if (!choice) return 'todo';
    return choice !== savedPairs.value[row.key] ? 'dirty' : 'done';
  }

  /* Le choix retenu au premier affichage : l'enregistre, sinon la suggestion du meme nom. */
  function initialChoice(root: any, path: string, kept: string | undefined): string {
    const candidates = locations.value
      .flatMap((location: any) => (location.mappings || []).map((mapping: any) => ({ mapping, virtual: location.virtual === true })))
      .filter(({ mapping }: any) => mapping.arr_instance_id === root.arr_instance_id && mapping.arr_root === path);
    const saved = (candidates.find(({ virtual }: any) => !virtual) || candidates[0])?.mapping;
    const choice = kept ?? (saved ? JSON.stringify([saved.plex_section_id, saved.plex_root]) : suggestedPlex(path, root.plex_roots));
    return root.plex_roots.some((plex: any) => JSON.stringify([plex.section_id, plex.path]) === choice) ? choice : '';
  }

  /** Relit les dossiers aupres des instances ; `silent` : sans erreur (rafraichissement de fond). */
  async function refresh(silent = false): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    try {
      const next = await api<any[]>('/api/storage/roots');
      if (JSON.stringify(next) !== JSON.stringify(roots.value)) {
        roots.value = next;
        const choices: Record<string, string> = {};
        for (const root of next) for (const path of root.arr_roots) choices[rowKey(root.arr_instance_id, path)] = initialChoice(root, path, pairs.value[rowKey(root.arr_instance_id, path)]);
        pairs.value = choices;
      }
      checkedAt = Date.now();
    } catch (cause) {
      if (!silent) throw cause;
    } finally {
      loading.value = false;
    }
  }

  /** Relecture de fond : pas plus d'une fois par minute. */
  const refreshIfStale = () => (Date.now() - checkedAt >= 60_000 ? refresh(true) : Promise.resolve());

  async function saveRow(row: MappingRow): Promise<void> {
    const mapping = rootMapping(row, pairs.value[row.key]);
    const existing = locations.value.find((location: any) => (location.mappings || []).some((m: any) => m.arr_instance_id === row.arr_instance_id && m.arr_root === row.arr_root));
    if (existing) {
      await api(`/api/storage/locations/${existing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: existing.name, mount_path: existing.mount_path, reserve_gb: existing.reserve_bytes / 1e9, reserve_percent: existing.reserve_percent ?? null, enabled: existing.enabled,
          mappings: existing.mappings.map((m: any) => (m.arr_instance_id === row.arr_instance_id && m.arr_root === row.arr_root ? { ...m, ...mapping } : { ...m })),
        }),
      });
      return;
    }
    await api('/api/storage/locations', {
      method: 'POST',
      body: JSON.stringify({ name: `${row.instance} · ${row.arr_root}`, mount_path: '', reserve_gb: 0, reserve_percent: null, enabled: true, mappings: [mapping] }),
    });
  }

  /** Enregistre chaque correspondance modifiee ; renvoie un resume (erreurs comprises). */
  async function save(): Promise<{ saved: number; failures: string[] }> {
    saving.value = true;
    const failures: string[] = [];
    const todo = dirtyRows.value;
    progress.value = { total: todo.length, completed: 0, current: '', saved: 0, failed: 0 };
    try {
      for (const row of todo) {
        progress.value.current = `${row.instance} · ${row.arr_root}`;
        try {
          await saveRow(row);
          progress.value.saved++;
        } catch (cause: any) {
          progress.value.failed++;
          failures.push(`${row.instance} · ${row.arr_root} : ${cause.message}`);
        } finally {
          progress.value.completed++;
        }
      }
      await reload();
      return { saved: progress.value.saved, failures };
    } finally {
      progress.value.current = '';
      saving.value = false;
    }
  }

  /** Abandonne les choix non enregistres. */
  function cancel(): void {
    const choices: Record<string, string> = {};
    for (const row of rows.value) choices[row.key] = savedPairs.value[row.key] && row.plex_roots.some((p: any) => JSON.stringify([p.section_id, p.path]) === savedPairs.value[row.key]) ? savedPairs.value[row.key] : '';
    pairs.value = choices;
  }

  return { roots, loading, saving, pairs, rows, groups, dirty, dirtyGroups, dirtyRows, progress, statusOf, refresh, refreshIfStale, save, cancel };
}
