import { computed, ref, watch, type Ref, type ComputedRef } from 'vue';

export function useTableSelection<T = any, K = any>(
  rows: Ref<T[]> | (() => T[]),
  keyOf: (row: T) => K = (row: any) => row.id
): {
  selectedKeys: Ref<Set<K>>;
  selectedRows: ComputedRef<T[]>;
  selectedIds: ComputedRef<K[]>;
  count: ComputedRef<number>;
  allSelected: ComputedRef<boolean>;
  partiallySelected: ComputedRef<boolean>;
  isSelected: (row: T) => boolean;
  toggle: (row: T, index?: number | null, event?: MouseEvent | KeyboardEvent | null) => void;
  toggleAll: () => void;
  clear: () => void;
  setKeys: (keys: Iterable<K>) => void;
  lastIndex: Ref<number | null>;
} {
  const list = () => (typeof rows === 'function' ? rows() : rows.value) || [];
  const selectedKeys = ref(new Set<K>()) as Ref<Set<K>>;
  const lastIndex = ref<number | null>(null);

  const selectedRows = computed(() => list().filter((row) => selectedKeys.value.has(keyOf(row))));
  const selectedIds = computed(() => [...selectedKeys.value]);
  const count = computed(() => selectedRows.value.length);
  const allSelected = computed(
    () => list().length > 0 && list().every((row) => selectedKeys.value.has(keyOf(row)))
  );
  const partiallySelected = computed(() => count.value > 0 && !allSelected.value);

  function isSelected(row: T): boolean {
    return selectedKeys.value.has(keyOf(row));
  }

  function clear(): void {
    selectedKeys.value = new Set<K>();
    lastIndex.value = null;
  }

  function setKeys(keys: Iterable<K>): void {
    selectedKeys.value = new Set<K>(keys);
  }

  function toggle(row: T, index: number | null = null, event: MouseEvent | KeyboardEvent | null = null): void {
    const key = keyOf(row);
    const next = new Set<K>(selectedKeys.value);

    if (event?.shiftKey && lastIndex.value !== null && index !== null && lastIndex.value !== index) {
      const [start, end] = [lastIndex.value, index].sort((a, b) => a - b);
      for (const item of list().slice(start, end + 1)) next.add(keyOf(item));
    } else if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }

    if (index !== null) lastIndex.value = index;
    selectedKeys.value = next;
  }

  function toggleAll(): void {
    selectedKeys.value = allSelected.value ? new Set<K>() : new Set<K>(list().map(keyOf));
    lastIndex.value = null;
  }

  watch(
    () => list().map(keyOf),
    (keys) => {
      const valid = new Set(keys);
      const kept = [...selectedKeys.value].filter((key) => valid.has(key));
      if (kept.length !== selectedKeys.value.size) selectedKeys.value = new Set<K>(kept);
    },
    { deep: true }
  );

  return {
    selectedKeys,
    selectedRows,
    selectedIds,
    count,
    allSelected,
    partiallySelected,
    isSelected,
    toggle,
    toggleAll,
    clear,
    setKeys,
    lastIndex,
  };
}
