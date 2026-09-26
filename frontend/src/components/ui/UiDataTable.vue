<template>
  <!-- Tableau commun a toute l'application. TanStack Table porte l'etat -- tri, selection,
       largeurs -- et ne dessine rien ; le rendu est un vrai <table>, qui devient une pile
       de cartes sur telephone par le systeme `.table-cards` (voir `_views.scss`) : chaque
       cellule y reprend son libelle depuis `data-label`. -->
  <div
    class="table-wrap rich ui-data-table"
    :class="{ 'is-compact': density === 'compact', 'table-cards': cards }"
    role="region"
    tabindex="0"
    :aria-label="label"
  >
    <table :style="tableStyle">
      <thead>
        <tr>
          <th v-if="selectable" class="ui-data-table__select" scope="col">
            <CheckboxRoot
              class="ui-data-table__check"
              :model-value="table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false"
              :disabled="!rows.length"
              aria-label="Tout sélectionner"
              @update:model-value="table.toggleAllRowsSelected($event === true)"
            >
              <CheckboxIndicator><Minus v-if="table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()" :size="12" /><Check v-else :size="12" /></CheckboxIndicator>
            </CheckboxRoot>
          </th>
          <th
            v-for="header in table.getFlatHeaders()"
            :key="header.id"
            scope="col"
            :class="[colonne(header.column.id)?.headerClass, { 'is-drag-over': api?.dragOverKey.value === header.column.id }]"
            :style="largeur(header.column.id)"
            :aria-sort="ariaSort(header.column.id)"
            :draggable="reorderable || undefined"
            @dragstart="reorderable && api?.startDrag(header.column.id, $event)"
            @dragover.prevent="reorderable && api?.dragOver(header.column.id, $event)"
            @dragleave="reorderable && api?.dragLeave(header.column.id)"
            @drop.prevent="reorderable && api?.drop(header.column.id)"
          >
            <button v-if="header.column.getCanSort()" type="button" class="ui-data-table__sort" @click="header.column.getToggleSortingHandler()?.($event)">
              <slot :name="`header-${header.column.id}`" :column="colonne(header.column.id)">{{ colonne(header.column.id)?.label }}</slot>
              <ChevronUp v-if="header.column.getIsSorted() === 'asc'" :size="13" aria-hidden="true" />
              <ChevronDown v-else-if="header.column.getIsSorted() === 'desc'" :size="13" aria-hidden="true" />
            </button>
            <slot v-else :name="`header-${header.column.id}`" :column="colonne(header.column.id)">{{ colonne(header.column.id)?.label }}</slot>
            <span
              v-if="resizable && header.column.getCanResize()"
              class="ui-data-table__resize"
              :class="{ 'is-resizing': header.column.getIsResizing() }"
              aria-hidden="true"
              @mousedown.stop.prevent="header.getResizeHandler()($event)"
              @touchstart.stop="header.getResizeHandler()($event)"
              @click.stop
            />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!visibleRows.length" class="ui-data-table__empty">
          <td :colspan="table.getVisibleLeafColumns().length + (selectable ? 1 : 0)"><slot name="empty">Aucun élément.</slot></td>
        </tr>
        <template v-for="(row, index) in visibleRows" :key="row.id">
          <tr
            :class="[rowClass?.(row.original), { 'is-selected': row.getIsSelected(), 'is-clickable': clickable }]"
            :tabindex="clickable ? 0 : undefined"
            :role="clickable ? 'button' : undefined"
            :aria-expanded="rowExpanded?.(row.original)"
            @click="$emit('row-click', row.original, Number(index), $event)"
            @keydown.enter="$emit('row-click', row.original, Number(index), $event)"
            @contextmenu="$emit('row-contextmenu', row.original, Number(index), $event)"
          >
            <td v-if="selectable" class="card-select ui-data-table__select" @click.stop>
            <CheckboxRoot
              class="ui-data-table__check"
              :model-value="row.getIsSelected()"
              :aria-label="`Sélectionner ${libelleLigne(row.original)}`"
              @click="choisir(Number(index), $event)"
            >
              <CheckboxIndicator><Check :size="12" /></CheckboxIndicator>
            </CheckboxRoot>
            </td>
            <td
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              :data-label="colonne(cell.column.id)?.label"
              :class="[classeCarte(cell.column.id), colonne(cell.column.id)?.className]"
              :style="largeur(cell.column.id)"
            >
              <slot :name="`cell-${cell.column.id}`" :row="row.original" :value="cell.getValue()" :index="index">{{ affichage(cell.getValue()) }}</slot>
            </td>
          </tr>
          <tr v-if="$slots['row-after']" class="ui-data-table__row-after">
            <td :colspan="row.getVisibleCells().length + (selectable ? 1 : 0)">
              <slot name="row-after" :row="row.original" :index="index" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <slot name="after" />
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, ref, watch } from 'vue';
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';
import { Check, ChevronDown, ChevronUp, Minus } from '@lucide/vue';
import {
  columnOrderingFeature, columnResizingFeature, columnSizingFeature, columnVisibilityFeature,
  createSortedRowModel, rowSelectionFeature, rowSortingFeature, sortFn_alphanumeric, sortFn_basic, sortFn_datetime,
  tableFeatures, useTable,
  type ColumnSizingState, type RowSelectionState, type SortingState, type Updater,
} from '@tanstack/vue-table';
import { useTableColumns } from '@/composables/useTableColumns';

export interface UiColumn<R = any> {
  key: string;
  label: string;
  /** Valeur de la cellule, et de son tri. Par defaut `row[key]`. */
  value?: (row: R) => unknown;
  /** Valeur de tri, si elle differe de la valeur affichee. */
  sortValue?: (row: R) => unknown;
  sortable?: boolean;
  /** Toujours visible : ni masquable ni retiree par le choix des colonnes. */
  required?: boolean;
  width?: number;
  minWidth?: number;
  /** Role dans la carte mobile : en-tete, actions, masquee, ou simple champ (defaut). */
  card?: 'title' | 'actions' | 'hidden' | 'field';
  className?: string;
  headerClass?: string;
}

export interface UiSort { key: string; direction: 'asc' | 'desc' }

const props = withDefaults(defineProps<{
  rows: T[];
  columns: UiColumn<T>[];
  rowKey: (row: T) => string | number;
  /** Nom accessible du tableau (annonce par les lecteurs d'ecran). */
  label: string;
  /** Tri courant. Avec `manualSort`, c'est le parent (souvent le serveur) qui trie. */
  sort?: UiSort | null;
  manualSort?: boolean;
  selectable?: boolean;
  selection?: Array<string | number>;
  /** Cle de preferences : active la memorisation des colonnes (ordre, visibilite, largeurs). */
  storageKey?: string;
  /** Preferences de colonnes deja tenues par le parent (qui affiche son propre choix de
   *  colonnes) : le tableau s'en sert pour l'ordre, la visibilite, le glisser et les largeurs. */
  columnPrefs?: ReturnType<typeof useTableColumns> | null;
  resizable?: boolean;
  reorderable?: boolean;
  density?: 'comfortable' | 'compact';
  clickable?: boolean;
  rowClass?: (row: T) => string | Record<string, boolean> | undefined;
  rowExpanded?: (row: T) => boolean | undefined;
  /** Rendu progressif : seules les N premieres lignes (triees) sont montees. */
  limit?: number;
  /** Libelle d'une ligne pour sa case de selection. */
  rowLabel?: (row: T) => string;
  /** Pile de cartes sur telephone (defaut). Un tableau de deux ou trois colonnes courtes
   *  reste plus lisible en tableau. */
  cards?: boolean;
}>(), {
  cards: true,
  sort: null, manualSort: false, selectable: false, selection: () => [], storageKey: '', columnPrefs: null,
  resizable: false, reorderable: false, density: 'comfortable', clickable: false,
  rowClass: undefined, rowExpanded: undefined, limit: 0, rowLabel: undefined,
});

const emit = defineEmits<{
  (e: 'update:sort', value: UiSort | null): void;
  (e: 'update:selection', value: Array<string | number>): void;
  (e: 'row-click', row: T, index: number, event: MouseEvent | KeyboardEvent): void;
  (e: 'row-contextmenu', row: T, index: number, event: MouseEvent): void;
}>();

/* Preferences de colonnes : l'ordre au glisser et au clavier, la visibilite et les
   largeurs, memorises par tableau. Sans cle, les colonnes sont celles passees. */
const api = props.columnPrefs ?? (props.storageKey
  ? useTableColumns(() => props.columns, {
      storageKey: props.storageKey,
      defaultWidths: Object.fromEntries(props.columns.filter((c) => c.width).map((c) => [c.key, c.width!])),
    })
  : null);
defineExpose({ columns: api });

const colonnes = computed(() => {
  if (!api) return props.columns;
  // L'ordre et la visibilite viennent des preferences ; la definition, des colonnes passees.
  return api.visibleColumns.value
    .map((pref: { key: string }) => props.columns.find((c) => c.key === pref.key))
    .filter((c): c is UiColumn<T> => Boolean(c))
    .concat(props.columns.filter((c) => c.required && c.card === 'actions' && !api.visibleColumns.value.some((p: { key: string }) => p.key === c.key)));
});
const colonne = (key: string) => props.columns.find((c) => c.key === key);

function resoudre<S>(updater: Updater<S>, courant: S): S {
  return typeof updater === 'function' ? (updater as (old: S) => S)(courant) : updater;
}

// ── Tri ─────────────────────────────────────────────────────────────────────
const triInterne = ref<SortingState>(props.sort ? [{ id: props.sort.key, desc: props.sort.direction === 'desc' }] : []);
const sorting = computed<SortingState>(() => props.manualSort
  ? (props.sort ? [{ id: props.sort.key, desc: props.sort.direction === 'desc' }] : [])
  : triInterne.value);
function onSortingChange(updater: Updater<SortingState>): void {
  const next = resoudre(updater, sorting.value);
  if (!props.manualSort) triInterne.value = next;
  emit('update:sort', next[0] ? { key: next[0].id, direction: next[0].desc ? 'desc' : 'asc' } : null);
}

// ── Selection ───────────────────────────────────────────────────────────────
const rowSelection = computed<RowSelectionState>(() => Object.fromEntries(props.selection.map((k) => [String(k), true])));
function onRowSelectionChange(updater: Updater<RowSelectionState>): void {
  const next = resoudre(updater, rowSelection.value);
  const cles = new Map(props.rows.map((row) => [String(props.rowKey(row)), props.rowKey(row)]));
  emit('update:selection', Object.keys(next).filter((k) => next[k]).map((k) => cles.get(k) ?? k));
}

// ── Largeurs ────────────────────────────────────────────────────────────────
const columnSizing = computed<ColumnSizingState>(() => (api ? api.columnWidths.value : {}));
function onColumnSizingChange(updater: Updater<ColumnSizingState>): void {
  if (api) api.columnWidths.value = resoudre(updater, api.columnWidths.value);
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime },
  rowSelectionFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  columnSizingFeature,
  columnResizingFeature,
});

const definitions = computed(() => colonnes.value.map((c) => ({
  id: c.key,
  accessorFn: (row: T) => (c.sortValue ?? c.value ?? ((r: any) => r?.[c.key]))(row),
  cell: (ctx: any) => (c.value ? c.value(ctx.row.original) : ctx.row.original?.[c.key]),
  enableSorting: c.sortable === true,
  sortingFn: 'alphanumeric' as const,
  sortUndefined: 'last' as const,
  size: c.width ?? 150,
  minSize: c.minWidth ?? 60,
  enableResizing: props.resizable,
})));

// Typee en `any` : TanStack type ses lignes en `RowData`, pas dans le generique `T` du
// composant. Les lignes exposees au gabarit restent celles recues (`row.original`).
const table: any = useTable({
  features,
  columns: definitions,
  data: computed(() => props.rows),
  getRowId: (row: T) => String(props.rowKey(row)),
  state: computed(() => ({ sorting: sorting.value, rowSelection: rowSelection.value, columnSizing: columnSizing.value })),
  onSortingChange,
  onRowSelectionChange,
  onColumnSizingChange,
  manualSorting: props.manualSort,
  enableSortingRemoval: false,
  columnResizeMode: 'onChange',
} as any);

const visibleRows = computed(() => {
  const all = table.getRowModel().rows;
  return props.limit > 0 ? all.slice(0, props.limit) : all;
});

/* Maj-clic etend la selection depuis la derniere case cochee, comme dans un gestionnaire
   de fichiers ; un clic simple bascule la ligne. */
const dernierIndex = ref<number | null>(null);
function choisir(index: number, event: MouseEvent): void {
  event.preventDefault();
  const lignes = visibleRows.value;
  const ligne = lignes[index];
  if (event.shiftKey && dernierIndex.value !== null && dernierIndex.value !== index) {
    const [debut, fin] = [dernierIndex.value, index].sort((a, b) => a - b);
    const next = { ...rowSelection.value };
    for (const r of lignes.slice(debut, fin + 1)) next[r.id] = true;
    onRowSelectionChange(next);
  } else {
    ligne.toggleSelected();
  }
  dernierIndex.value = index;
}
watch(() => props.rows, () => { dernierIndex.value = null; });

function ariaSort(key: string): 'ascending' | 'descending' | 'none' | undefined {
  if (colonne(key)?.sortable !== true) return undefined;
  const s = sorting.value[0];
  if (!s || s.id !== key) return 'none';
  return s.desc ? 'descending' : 'ascending';
}

function largeur(key: string): Record<string, string> | undefined {
  const w = columnSizing.value[key] ?? colonne(key)?.width;
  return w ? { width: `${w}px`, minWidth: `${w}px` } : undefined;
}
const tableStyle = computed(() => (props.resizable ? { tableLayout: 'fixed' as const, minWidth: '100%', width: 'max-content' } : undefined));

function classeCarte(key: string): string {
  const role = colonne(key)?.card;
  return role === 'title' ? 'card-title' : role === 'actions' ? 'card-actions' : role === 'hidden' ? 'card-hidden' : '';
}

function affichage(value: unknown): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function libelleLigne(row: T): string {
  return props.rowLabel ? props.rowLabel(row) : String(props.rowKey(row));
}
</script>

<style scoped lang="scss">
.ui-data-table table { width: 100%; border-collapse: collapse; }
.ui-data-table th { position: relative; text-align: left; white-space: nowrap; }
.ui-data-table th[draggable="true"] { cursor: grab; }
.ui-data-table th.is-drag-over { box-shadow: inset 3px 0 0 var(--accent); }
.ui-data-table__sort {
  display: inline-flex; align-items: center; gap: 4px; min-height: 0; padding: 0; border: 0;
  background: transparent; color: inherit; font: inherit; font-weight: inherit; text-transform: inherit; cursor: pointer;
}
.ui-data-table__sort:hover { color: var(--text); }
.ui-data-table__sort:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-xs); }
.ui-data-table__resize {
  position: absolute; top: 0; right: 0; z-index: 2; width: 8px; height: 100%; cursor: col-resize; touch-action: none; user-select: none;
}
.ui-data-table__resize:hover, .ui-data-table__resize.is-resizing { background: var(--accent); opacity: .85; }
.ui-data-table__select { width: 38px; }
.ui-data-table__check {
  display: grid; place-items: center; width: 18px; height: 18px; min-height: 0; padding: 0;
  border: 1.5px solid var(--border-control); border-radius: var(--radius-xs);
  background: var(--surface-2); color: var(--on-accent); cursor: pointer;
}
.ui-data-table__check[data-state="checked"], .ui-data-table__check[data-state="indeterminate"] { border-color: var(--accent); background: var(--accent); }
/* Coche forcee en noir epais : la regle globale `span { color: muted }` la grisait. */
.ui-data-table__check :deep(svg) { color: var(--on-accent); stroke-width: 3.5; }
.ui-data-table__check:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ui-data-table tr.is-clickable { cursor: pointer; }
.ui-data-table tr.is-clickable:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.ui-data-table__row-after:has(> td:empty) { display: none; }
.ui-data-table tbody tr.is-selected { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.ui-data-table__empty td { padding: var(--space-5); color: var(--muted); text-align: center; }
.ui-data-table.is-compact th, .ui-data-table.is-compact td { padding-top: 6px; padding-bottom: 6px; }
</style>
