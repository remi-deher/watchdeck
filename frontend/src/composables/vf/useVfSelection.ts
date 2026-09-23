import { computed, ref } from 'vue';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import type { Notify } from './types';

export interface SelectedMedia {
  source_type: string;
  source_id: number;
}

/** « library_item:42 » -> { source_type: 'library_item', source_id: 42 } */
export function mediaFromKey(key: string): SelectedMedia {
  const [source_type, source_id] = key.split(':');
  return { source_type, source_id: Number(source_id) };
}

/**
 * Selection de medias pour un scan groupe, et le scan lui-meme.
 *
 * Les cles sont celles des groupes de suggestions (`source_type:source_id`). Le scan
 * vide la selection et laisse `onScanned` rafraichir la liste.
 */
export function useVfSelection(notify: Notify, onScanned: () => Promise<unknown> | unknown) {
  const selectedKeys = ref(new Set<string>());
  const scanning = ref(false);
  const count = computed(() => selectedKeys.value.size);

  const isSelected = (key: string): boolean => selectedKeys.value.has(key);

  function toggle(key: string): void {
    const next = new Set(selectedKeys.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selectedKeys.value = next;
  }

  function clear(): void {
    selectedKeys.value = new Set();
  }

  async function scanSelected(): Promise<void> {
    const media = [...selectedKeys.value].map(mediaFromKey);
    if (!media.length) return;
    scanning.value = true;
    try {
      const result = await api<{ scanned?: number; found?: number }>('/api/vf-upgrades/scan-selected', {
        method: 'POST',
        body: JSON.stringify({ media }),
      });
      notify(`${result.scanned || 0} recherche(s), ${result.found || 0} suggestion(s) trouvée(s).`);
      clear();
      await onScanned();
    } catch (e) {
      notify(humanizeError(e), 'error');
    } finally {
      scanning.value = false;
    }
  }

  return { selectedKeys, scanning, count, isSelected, toggle, clear, scanSelected };
}
