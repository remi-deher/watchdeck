<template>
  <section class="panel table-wrap table-cards rich data-table" :class="`density-${density}`" tabindex="0" role="region">
    <div class="data-table__tools">
      <slot name="tools" />
      <button
        type="button"
        class="secondary text-xs data-table__density"
        :class="{ active: density === 'compact' }"
        :title="density === 'compact' ? 'Affichage compact' : 'Affichage confortable'"
        @click="toggleDensity"
      >
        <Minimize2 v-if="density === 'compact'" /><Maximize2 v-else />{{ density === 'compact' ? 'Compact' : 'Normal' }}
      </button>
    </div>
    <table>
      <thead>
        <tr>
          <th v-for="column in visibleColumns" :key="column.key"
              :class="[column.className, { 'drag-over': dragOverKey === column.key, 'is-dragging': draggedKey === column.key }]"
              :data-priority="column.priority || (column.required ? 'primary' : 'secondary')"
              :style="{ width: columnWidths[column.key] ? `${columnWidths[column.key]}px` : undefined }"
              :aria-sort="sortable && column.sortable !== false ? ariaSort(column.key) : undefined"
              draggable="true"
              @dragstart="startDrag(column.key, $event)"
              @dragover.prevent="dragOver(column.key, $event)"
              @dragleave="dragLeave(column.key)"
              @drop.prevent="drop(column.key)"
          >
            <button v-if="sortable && column.sortable !== false" class="sort-button" @click="sortBy(column.key)">
              <span>{{ column.label }}</span>
              <ArrowUpDown />
            </button>
            <span v-else>{{ column.label }}</span>
            <!-- Largeur ajustable, comme sur le tableau des clients torrent : un titre
                 long et une date n'ont pas besoin de la meme place. -->
            <div class="col-resize-handle" title="Redimensionner la colonne" @pointerdown.prevent.stop="startColumnResize(column.key, $event)"></div>
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
          v-for="(column, index) in orderedColumns"
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
          <span class="column-reorder-buttons">
            <button type="button" class="column-reorder-btn" :disabled="index === 0" :aria-label="`Déplacer ${column.label} vers le haut`" @click="moveColumn(column.key, -1)"><ChevronUp /></button>
            <button type="button" class="column-reorder-btn" :disabled="index === orderedColumns.length - 1" :aria-label="`Déplacer ${column.label} vers le bas`" @click="moveColumn(column.key, 1)"><ChevronDown /></button>
          </span>
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
import { computed, ref } from 'vue';
import { ArrowUpDown, ChevronDown, ChevronUp, Maximize2, Minimize2 } from '@lucide/vue';
import { useTableColumns } from '@/composables/useTableColumns';
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
    /** Tri pilote par le parent : la table n'ordonne plus ses lignes elle-meme et se
     *  contente d'emettre le choix. Necessaire des que les lignes sont paginees --
     *  trier la page affichee ne trie pas le jeu de donnees. */
    sortKey?: string | null;
    sortDirection?: 'asc' | 'desc';
  }>(),
  {
    rows: () => [],
    rowKey: (row: any, index?: number) => row?.id ?? index,
    preferenceScope: 'default',
    defaultVisible: null,
    sortable: true,
    defaultSortKey: '',
    clickableRows: false,
    sortKey: undefined,
    sortDirection: undefined,
  }
);

const emit = defineEmits<{
  (e: 'row-click', row: any): void;
  (e: 'update:sort', value: { key: string; direction: 'asc' | 'desc' }): void;
}>();

const showColumnPicker = ref(false);

/* Ordre, visibilite, largeurs et densite viennent du composable partage avec le tableau
   des clients torrent : c'etait deux fois le meme code, dont une seule savait
   redimensionner ses colonnes. */
const {
  columnWidths,
  density,
  orderedColumns,
  visibleColumns,
  visibleKeys,
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
} = useTableColumns(
  () => props.columns,
  { storageKey: `watchdeck:data-table-columns:${props.preferenceScope}`, defaultVisible: props.defaultVisible }
);

const controlled = computed(() => props.sortKey !== undefined);
const localSortKey = ref(props.defaultSortKey);
const localSortDirection = ref<'asc' | 'desc'>('asc');
const sortKey = computed(() => (controlled.value ? props.sortKey || '' : localSortKey.value));
const sortDirection = computed(() => (controlled.value ? props.sortDirection || 'asc' : localSortDirection.value));

function ariaSort(key: string): 'none' | 'ascending' | 'descending' {
  if (sortKey.value !== key) return 'none';
  return sortDirection.value === 'asc' ? 'ascending' : 'descending';
}

function sortBy(key: string): void {
  const direction: 'asc' | 'desc' = sortKey.value === key && sortDirection.value === 'asc' ? 'desc' : 'asc';
  if (controlled.value) {
    emit('update:sort', { key, direction });
    return;
  }
  localSortKey.value = key;
  localSortDirection.value = direction;
}

const sortedRows = computed(() => {
  // En mode pilote, les lignes arrivent deja triees par le serveur.
  if (controlled.value || !props.sortable || !sortKey.value) return props.rows;
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
/* Meme grammaire que le tableau des clients torrent : largeurs fixes et ajustables,
   entete collante, cellules sur une ligne, densite reglable. */
.data-table :deep(table) { table-layout: fixed; min-width: max-content; width: 100%; }
.data-table :deep(thead th) { position: sticky; top: 0; z-index: 2; background: var(--surface); }
.data-table :deep(th), .data-table :deep(td) { overflow: hidden; text-overflow: ellipsis; position: relative; }
.data-table.density-compact :deep(th), .data-table.density-compact :deep(td) { padding-block: 5px; font-size: var(--fs-xs); }

.data-table__tools { display: flex; justify-content: flex-end; gap: var(--space-2); margin-bottom: var(--space-2); }
.data-table__density { display: inline-flex; align-items: center; gap: 6px; }
.data-table__density svg { width: 14px; height: 14px; }
.data-table__density.active { border-color: var(--accent); color: var(--accent); }

.col-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 3;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
  touch-action: none;
}
.col-resize-handle:hover, .col-resize-handle:active { background: var(--accent); opacity: .85; }
@media (max-width: 767.98px) {
  /* Au doigt, sur une seule colonne empilee, redimensionner n'a plus de sens. */
  .col-resize-handle { display: none; }
  .data-table :deep(table) { table-layout: auto; }
}
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
.column-picker-item > span:not(.column-drag-handle):not(.column-reorder-buttons) { flex: 1; }
.column-picker-item input { cursor: pointer; }
.column-reorder-buttons { display: inline-flex; gap: 2px; }
.column-reorder-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: var(--radius-xs); background: transparent; color: var(--muted); cursor: pointer; }
.column-reorder-btn:hover:not(:disabled) { color: var(--text); background: var(--surface-3); }
.column-reorder-btn:disabled { opacity: .35; cursor: not-allowed; }
.column-reorder-btn svg { width: 14px; height: 14px; }
.column-drag-handle { color: var(--muted); font-size: 18px; line-height: 1; }
@media (max-width: 620px) { .column-picker-grid { grid-template-columns: 1fr; } }
</style>
