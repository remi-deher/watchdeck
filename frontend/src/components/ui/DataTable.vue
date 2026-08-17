<template>
  <section class="panel table-wrap table-cards rich data-table">
    <table>
      <thead>
        <tr>
          <th v-for="column in visibleColumns" :key="column.key"
              :class="[column.className, { 'drag-over': dragOverKey === column.key, 'is-dragging': draggedKey === column.key }]"
              :data-priority="column.priority || (column.required ? 'primary' : 'secondary')"
              draggable="true"
              @dragstart="startDrag(column.key, $event)"
              @dragover.prevent="dragOver(column.key, $event)"
              @dragleave="dragLeave(column.key)"
              @drop.prevent="drop(column.key)"
          >
            <button v-if="sortable && column.sortable !== false" class="sort-button" :aria-sort="ariaSort(column.key)" @click="sortBy(column.key)">
              <span>{{ column.label }}</span>
              <ArrowUpDown />
            </button>
            <span v-else>{{ column.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in sortedRows"
          :key="rowKey(row)"
          :class="{ clickable: clickableRows }"
          @click="clickableRows && $emit('row-click', row)"
        >
          <td v-for="column in visibleColumns" :key="column.key" :class="column.className" :data-label="column.label" :data-priority="column.priority || (column.required ? 'primary' : 'secondary')">
            <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">{{ formatDefault(row[column.key]) }}</slot>
          </td>
        </tr>
      </tbody>
    </table>
    <UiEmptyState v-if="!rows.length" compact><slot name="empty">Aucune ligne à afficher.</slot></UiEmptyState>
    <slot name="footer" />

    <ModalShell :open="showColumnPicker" title="Personnaliser les colonnes" subtitle="Choisissez et réordonnez les colonnes affichées." @close="showColumnPicker = false">
      <div class="column-picker-grid">
        <div
          v-for="column in orderedColumns"
          :key="column.key"
          class="column-picker-item"
          :class="{ dragging: draggedKey === column.key }"
          draggable="true"
          @dragstart="startDrag(column.key, $event)"
          @dragover.prevent
          @drop="drop(column.key)"
        >
          <input
            type="checkbox"
            :checked="column.required || visibleKeys.has(column.key)"
            :disabled="column.required"
            @change="toggleColumn(column.key)"
          />
          <span>{{ column.label }}</span>
          <span class="column-drag-handle" aria-hidden="true">⠿</span>
        </div>
      </div>
      <template #actions>
        <UiButton variant="primary" @click="showColumnPicker = false">Valider</UiButton>
      </template>
    </ModalShell>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowUpDown } from '@lucide/vue';
import ModalShell from './ModalShell.vue';
import UiButton from './UiButton.vue';
import UiEmptyState from './UiEmptyState.vue';

export interface DataTableColumn {
  key: string;
  label: string;
  required?: boolean;
  sortable?: boolean;
  className?: string;
  priority?: 'primary' | 'secondary' | 'optional';
}

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn[];
    rows?: any[];
    rowKey?: (row: any, index?: number) => any;
    preferenceScope?: string;
    defaultVisible?: string[] | null;
    sortable?: boolean;
    defaultSortKey?: string;
    clickableRows?: boolean;
  }>(),
  {
    rows: () => [],
    rowKey: (row: any, index?: number) => row?.id ?? index,
    preferenceScope: 'default',
    defaultVisible: null,
    sortable: true,
    defaultSortKey: '',
    clickableRows: false,
  }
);

defineEmits<{
  (e: 'row-click', row: any): void;
}>();

const STORAGE_KEY = `watchdeck:data-table-columns:${props.preferenceScope}`;
const validKeys = new Set(props.columns.map((column) => column.key));
const stored = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
})();
const savedOrder: string[] = Array.isArray(stored?.order)
  ? stored.order.filter((key: string) => validKeys.has(key))
  : [];
const columnOrder = ref<string[]>([
  ...savedOrder,
  ...props.columns.map((column) => column.key).filter((key) => !savedOrder.includes(key)),
]);
const defaultVisibleKeys = props.defaultVisible || props.columns.map((column) => column.key);
const visibleKeys = ref<Set<string>>(
  new Set((Array.isArray(stored?.visible) ? stored.visible : defaultVisibleKeys).filter((key: string) => validKeys.has(key)))
);
const showColumnPicker = ref(false);
const draggedKey = ref('');
const dragOverKey = ref('');

const orderedColumns = computed(() =>
  columnOrder.value.map((key) => props.columns.find((column) => column.key === key)).filter(Boolean) as DataTableColumn[]
);
const visibleColumns = computed(() =>
  orderedColumns.value.filter((column) => column.required || visibleKeys.value.has(column.key))
);

watch(
  [visibleKeys, columnOrder],
  () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ visible: [...visibleKeys.value], order: columnOrder.value })
      );
    } catch {
      /* Préférences non persistables */
    }
  },
  { deep: true }
);

function toggleColumn(key: string): void {
  const next = new Set(visibleKeys.value);
  if (next.has(key)) {
    if (next.size > 1) next.delete(key);
  } else {
    next.add(key);
  }
  visibleKeys.value = next;
}

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
  next.splice(next.indexOf(sourceKey), 1);
  next.splice(next.indexOf(targetKey), 0, sourceKey);
  columnOrder.value = next;
}

const sortKey = ref(props.defaultSortKey);
const sortDirection = ref<'asc' | 'desc'>('asc');

function ariaSort(key: string): 'none' | 'ascending' | 'descending' {
  if (sortKey.value !== key) return 'none';
  return sortDirection.value === 'asc' ? 'ascending' : 'descending';
}

function sortBy(key: string): void {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDirection.value = 'asc';
  }
}

const sortedRows = computed(() => {
  if (!props.sortable || !sortKey.value) return props.rows;
  return [...props.rows].sort((left, right) => {
    const a = left[sortKey.value] ?? '';
    const b = right[sortKey.value] ?? '';
    const result =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
    return sortDirection.value === 'asc' ? result : -result;
  });
});

function formatDefault(value: any): string {
  if (Array.isArray(value)) return value.join(', ') || '—';
  return value ?? '—';
}

defineExpose({
  openColumnPicker: () => {
    showColumnPicker.value = true;
  },
});
</script>

<style scoped lang="scss">
.data-table :deep(table) { table-layout: auto; min-width: max-content; }
.data-table :deep(th), .data-table :deep(td) { white-space: nowrap; }
.data-table :deep(td.card-title) { white-space: normal; }
@media (max-width: 767.98px) {
  .data-table :deep(table) { min-width: 0; }
  .data-table :deep(th), .data-table :deep(td) { white-space: normal; }
  .data-table :deep([data-priority="optional"]) { display: none; }
}
@media (max-width: 419.98px) {
  .data-table :deep([data-priority="secondary"]) { display: none; }
}
.sort-button { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; font-weight: inherit; cursor: pointer; }
.sort-button:hover { color: var(--accent); }
.sort-button svg { width: 12px; height: 12px; flex-shrink: 0; opacity: .6; }
thead th { user-select: none; cursor: grab; }
thead th.is-dragging { opacity: .45; }
thead th.drag-over { box-shadow: inset 3px 0 0 var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface-2)); }
tbody tr.clickable { cursor: pointer; }
tbody tr.clickable:hover { background: var(--surface-2); }

.column-picker-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 10px 0; }
.column-picker-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--surface-2); font-size: var(--fs-xs); user-select: none; cursor: grab; }
.column-picker-item.dragging { opacity: .45; }
.column-picker-item > span:not(.column-drag-handle) { flex: 1; }
.column-picker-item input { cursor: pointer; }
.column-drag-handle { color: var(--muted); font-size: 18px; line-height: 1; }
@media (max-width: 620px) { .column-picker-grid { grid-template-columns: 1fr; } }
</style>
