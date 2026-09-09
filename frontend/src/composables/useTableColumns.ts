/* Colonnes d'un tableau : ordre, visibilite, largeurs, et leur persistance.
 *
 * Ce code existait en double, presque a l'identique, dans `DataTable` et dans le tableau
 * des clients torrent -- avec une difference : seul le second savait redimensionner ses
 * colonnes et se resserrer. Les deux partagent desormais la meme mecanique, ce qui donne
 * a l'inventaire l'ergonomie de la page Acquisition sans la recoder. */
import { computed, ref, watch, type Ref } from 'vue';

export interface TableColumnLike {
  key: string;
  label?: string;
  required?: boolean;
  [key: string]: any;
}

export interface UseTableColumnsOptions<T extends TableColumnLike> {
  /** Cle de rangement : chaque tableau garde ses preferences pour lui. */
  storageKey: string;
  /** Colonnes visibles a la premiere ouverture. Par defaut, toutes. */
  defaultVisible?: string[] | null;
  /** Largeurs de depart, en pixels. */
  defaultWidths?: Record<string, number>;
  /** Nombre minimal de colonnes affichees : on ne vide pas un tableau. */
  minimumVisible?: number;
}

function readStored(storageKey: string): any {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || 'null');
  } catch {
    return null;
  }
}

export function useTableColumns<T extends TableColumnLike>(
  allColumns: Ref<T[]> | (() => T[]),
  options: UseTableColumnsOptions<T>
) {
  const source = computed(() => (typeof allColumns === 'function' ? allColumns() : allColumns.value));
  const stored = readStored(options.storageKey);
  const minimumVisible = options.minimumVisible ?? 1;

  const validKeys = computed(() => new Set(source.value.map((column) => column.key)));
  const savedOrder: string[] = Array.isArray(stored?.order) ? stored.order : [];
  const columnOrder = ref<string[]>([
    ...savedOrder.filter((key) => validKeys.value.has(key)),
    ...source.value.map((column) => column.key).filter((key) => !savedOrder.includes(key)),
  ]);

  const defaultVisible = options.defaultVisible || source.value.map((column) => column.key);
  const visibleKeys = ref<Set<string>>(
    new Set(
      (Array.isArray(stored?.visible) ? stored.visible : defaultVisible).filter((key: string) =>
        validKeys.value.has(key)
      )
    )
  );

  const columnWidths = ref<Record<string, number>>({ ...(options.defaultWidths || {}), ...(stored?.widths || {}) });
  const density = ref<'comfortable' | 'compact'>(stored?.density === 'compact' ? 'compact' : 'comfortable');

  /* Une colonne ajoutee par une nouvelle version doit apparaitre : les preferences
     rangees ne connaissent qu'un ancien jeu de cles. */
  watch(source, (columns) => {
    const keys = columns.map((column) => column.key);
    const known = new Set(columnOrder.value);
    const added = keys.filter((key) => !known.has(key));
    if (added.length) {
      columnOrder.value = [...columnOrder.value.filter((key) => keys.includes(key)), ...added];
      visibleKeys.value = new Set([...visibleKeys.value, ...added]);
    }
  });

  const orderedColumns = computed(
    () =>
      columnOrder.value
        .map((key) => source.value.find((column) => column.key === key))
        .filter((column): column is T => Boolean(column))
  );
  const visibleColumns = computed(() =>
    orderedColumns.value.filter((column) => column.required || visibleKeys.value.has(column.key))
  );

  watch(
    [visibleKeys, columnOrder, columnWidths, density],
    () => {
      try {
        localStorage.setItem(
          options.storageKey,
          JSON.stringify({
            visible: [...visibleKeys.value],
            order: columnOrder.value,
            widths: columnWidths.value,
            density: density.value,
          })
        );
      } catch {
        /* Préférences non persistables : le tableau reste utilisable. */
      }
    },
    { deep: true }
  );

  function toggleColumn(key: string): void {
    const next = new Set(visibleKeys.value);
    if (next.has(key)) {
      if (next.size > minimumVisible) next.delete(key);
    } else {
      next.add(key);
    }
    visibleKeys.value = next;
  }

  const draggedKey = ref('');
  const dragOverKey = ref('');

  function startDrag(key: string, event: DragEvent): void {
    draggedKey.value = key;
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  function dragOver(key: string, event: DragEvent): void {
    if (draggedKey.value && draggedKey.value !== key) {
      dragOverKey.value = key;
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }
  }
  function dragLeave(key: string): void {
    if (dragOverKey.value === key) dragOverKey.value = '';
  }
  function drop(targetKey: string): void {
    const sourceKey = draggedKey.value;
    draggedKey.value = '';
    dragOverKey.value = '';
    if (!sourceKey || sourceKey === targetKey) return;
    const next = [...columnOrder.value];
    const sourceIndex = next.indexOf(sourceKey);
    const targetIndex = next.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0) return;
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, sourceKey);
    columnOrder.value = next;
  }

  /* Equivalent clavier/tactile au glisser-deposer : le drag-and-drop HTML5 n'est
     operable ni au clavier ni au toucher (WCAG 2.1.1 et 2.5.7). */
  function moveColumn(key: string, direction: -1 | 1): void {
    const next = [...columnOrder.value];
    const index = next.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    columnOrder.value = next;
  }

  let resizingKey: string | null = null;
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  // pointerdown/move/up plutot que mousedown/mousemove/mouseup : le redimensionnement
  // fonctionne ainsi aussi au doigt sur tablette, pas seulement a la souris.
  function startColumnResize(key: string, event: PointerEvent): void {
    resizingKey = key;
    resizeStartX = event.clientX;
    resizeStartWidth = columnWidths.value[key] || (event.target as HTMLElement)?.parentElement?.offsetWidth || 100;
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeEnd);
  }
  function onResizeMove(event: PointerEvent): void {
    if (!resizingKey) return;
    columnWidths.value = { ...columnWidths.value, [resizingKey]: Math.max(50, resizeStartWidth + event.clientX - resizeStartX) };
  }
  function onResizeEnd(): void {
    resizingKey = null;
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', onResizeEnd);
  }

  function toggleDensity(): void {
    density.value = density.value === 'compact' ? 'comfortable' : 'compact';
  }

  return {
    columnOrder,
    visibleKeys,
    columnWidths,
    density,
    orderedColumns,
    visibleColumns,
    draggedKey,
    dragOverKey,
    toggleColumn,
    startDrag,
    dragOver,
    dragLeave,
    drop,
    moveColumn,
    startColumnResize,
    toggleDensity,
  };
}
