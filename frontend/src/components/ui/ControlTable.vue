<template>
  <!-- Tableau de contrôle : lire une liste de ressources durables ET agir dessus. C'est
       UiDataTable (lecture, tri, selection) auquel s'ajoutent, par definition de donnees :
         - la barre d'actions groupees (BulkActionBar) sur la selection ;
         - les actions d'une ligne : les deux premieres visibles, le reste dans « … » ;
         - la confirmation, quand l'action en demande une (`confirm`) ;
         - l'ouverture de la ligne (`open`) ; Maj / Ctrl-clic etend ou bascule la selection ;
         - en option : les colonnes que l'utilisateur ordonne, masque et redimensionne
           (`columnsKey`), le menu contextuel (`contextMenu`), le rendu par paquets (`batch`).
       Il ne fait rien lui-meme : il emet `action(cle, lignes)` et la page agit. Les cellules
       propres a la page passent par les emplacements `cell-<cle>`. -->
  <div class="control-table">
    <BulkActionBar :count="selectedRows.length" :singular="labels.singular" :plural="labels.plural" @clear="selected = []">
      <ControlActions :actions="bulkActions" @run="(action) => run(action, selectedRows, 'bulk')" />
    </BulkActionBar>
    <!-- Sans selection, les actions qui portent sur toute la liste (vider la file…) ; le choix
         des colonnes reste a portee. -->
    <div v-if="(globalActions.length && !selectedRows.length) || columnPrefs" class="control-table__global" role="toolbar" :aria-label="labels.global">
      <ControlActions v-if="!selectedRows.length" :actions="globalActions" @run="(action) => run(action, [], 'global')" />
      <UiButton v-if="columnPrefs" size="sm" icon-only title="Personnaliser les colonnes" aria-label="Personnaliser les colonnes" @click="pickerOpen = true"><Columns /></UiButton>
    </div>

    <UiContextMenu :disabled="!contextMenu" :label="contextLabel">
      <UiDataTable
        class="panel"
        :label="label"
        :rows="rows"
        :columns="allColumns"
        :column-prefs="columnPrefs"
        :row-key="rowKey"
        :row-label="rowLabel"
        :row-class="rowClass"
        :sort="initialSort"
        :manual-sort="manualSort"
        @update:sort="emit('update:sort', $event)"
        :resizable="resizable"
        :reorderable="reorderable"
        :density="density"
        :limit="batch > 0 ? shown : 0"
        :clickable="openable"
        :selectable="bulkActions.length > 0"
        v-model:selection="selected"
        @row-click="onRowClick"
        @row-contextmenu="onContextMenu"
      >
        <template #empty><UiEmptyState v-if="!loading" :title="labels.empty" compact /></template>
        <template v-for="name in forwarded" :key="name" #[name]="scope"><slot :name="name" v-bind="scope || {}" /></template>
        <template v-if="moreToLoad" #after><InfiniteScrollTrigger :has-more="moreToLoad" :loading="loadingMore" @load="loadMore" /></template>
        <template v-if="rowActions" #cell-actions="{ row }">
          <span class="control-table__actions">
            <UiButton
              v-for="action in inline(row)"
              :key="action.key"
              :icon-only="Boolean(action.icon)"
              :variant="action.tone === 'danger' ? 'danger' : 'secondary'"
              :disabled="action.disabled"
              :title="action.title || action.label"
              :aria-label="`${action.label} ${nameOf(row)}`"
              @click.stop="run(action, [row], 'row')"
            ><component :is="action.icon" v-if="action.icon" /><template v-else>{{ action.label }}</template></UiButton>
            <UiMenu v-if="overflow(row).length" :label="nameOf(row)">
              <template #trigger>
                <UiButton icon-only :title="inlineActions ? 'Plus d’actions' : 'Actions'" :aria-label="`${inlineActions ? 'Plus d’actions pour' : 'Actions sur'} ${nameOf(row)}`" @click.stop><Ellipsis /></UiButton>
              </template>
              <template v-for="item in overflow(row)" :key="item.key">
                <UiMenuSeparator v-if="item.separated" />
                <UiMenuItem :variant="item.tone === 'danger' ? 'danger' : 'default'" :disabled="item.disabled" @select="run(item, [row], 'row')">
                  <component :is="item.icon" v-if="item.icon" /> {{ item.label }}
                </UiMenuItem>
              </template>
            </UiMenu>
          </span>
        </template>
      </UiDataTable>
      <template #items>
        <template v-for="item in contextItems" :key="item.key">
          <UiMenuSeparator v-if="item.separated" />
          <UiMenuItem :variant="item.tone === 'danger' ? 'danger' : 'default'" :disabled="item.disabled" @select="run(item, contextTargets, 'row')">
            <component :is="item.icon" v-if="item.icon" /> {{ item.label }}
          </UiMenuItem>
        </template>
      </template>
    </UiContextMenu>

    <ColumnPickerModal v-if="columnPrefs" :open="pickerOpen" :prefs="columnPrefs" :defaults="columns" @close="pickerOpen = false" />
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </div>
</template>

<script lang="ts">
import type { ConfirmDialogOptions } from '@/composables/useConfirm';

/** Une action du tableau de contrôle : sur la selection, ou sur une ligne. */
export interface ControlAction<T = any> {
  /** Cle emise avec l'evenement `action` ; la page la decode (`status:on`, `delete`…). */
  key: string;
  label: string;
  icon?: any;
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  /** Bascule : l'action est enfoncee quand son etat est actif (densite, mode discret…). */
  pressed?: boolean;
  title?: string;
  /** Un trait avant cette entree, dans un menu. */
  separated?: boolean;
  /** Presente, l'action ouvre un menu de ces entrees. */
  items?: ControlAction<T>[];
  /** Confirmation demandee avant d'emettre ; `null` pour s'en passer selon les lignes. */
  confirm?: (rows: T[]) => ConfirmDialogOptions | null;
}

export interface ControlLabels {
  singular?: string;
  plural?: string;
  /** Titre du tableau vide. */
  empty?: string;
  /** Nom de la barre des actions sur toute la liste. */
  global?: string;
}
</script>

<script setup lang="ts" generic="T">
import { computed, ref, useSlots, watch } from 'vue';
import { useEventListener } from '@vueuse/core';
import { Columns, Ellipsis } from '@lucide/vue';
import { useConfirm } from '@/composables/useConfirm';
import { useTableColumns } from '@/composables/useTableColumns';
import ConfirmModal from '@/components/ConfirmModal.vue';
import BulkActionBar from './BulkActionBar.vue';
import ColumnPickerModal from './ColumnPickerModal.vue';
import ControlActions from './ControlActions.vue';
import InfiniteScrollTrigger from './InfiniteScrollTrigger.vue';
import UiButton from './UiButton.vue';
import UiContextMenu from './UiContextMenu.vue';
import UiDataTable, { type UiColumn, type UiSort } from './UiDataTable.vue';
import UiEmptyState from './UiEmptyState.vue';
import UiMenu from './UiMenu.vue';
import UiMenuItem from './UiMenuItem.vue';
import UiMenuSeparator from './UiMenuSeparator.vue';

const props = withDefaults(defineProps<{
  rows: T[];
  columns: UiColumn<T>[];
  rowKey: (row: T) => string | number;
  /** Nom accessible du tableau. */
  label: string;
  /** Nom d'une ligne, pour ses cases et ses boutons. */
  rowLabel?: (row: T) => string;
  rowClass?: (row: T) => string | Record<string, boolean> | undefined;
  loading?: boolean;
  labels?: ControlLabels;
  /** Actions de la selection. */
  bulkActions?: ControlAction<T>[];
  /** Actions sur toute la liste, montrees quand rien n'est coche : `action(cle, [])`. */
  globalActions?: ControlAction<T>[];
  /** Liste chargee par paquets : le defilement emet `load-more`. */
  hasMore?: boolean;
  loadingMore?: boolean;
  /** Actions d'une ligne : les `inlineActions` premieres visibles, le reste dans « … ». */
  rowActions?: ((row: T) => ControlAction<T>[]) | null;
  inlineActions?: number;
  /** Un clic sur la ligne (hors boutons) l'ouvre : evenement `open`. */
  openable?: boolean;
  /** Tri de depart ; l'en-tete trie ensuite. */
  initialSort?: UiSort | null;
  manualSort?: boolean;
  /** Cle de rangement des colonnes : l'utilisateur les ordonne, les masque et les
   *  redimensionne, et le tableau s'en souvient. Absente, les colonnes sont fixes. */
  columnsKey?: string;
  /** Colonnes montrees a la premiere ouverture (par defaut, toutes). */
  defaultVisible?: string[];
  resizable?: boolean;
  reorderable?: boolean;
  density?: 'comfortable' | 'compact';
  /** Clic droit (ou appui long) : les actions de la ligne, ou de la selection. */
  contextMenu?: boolean;
  /** Rendu par paquets de N lignes, au defilement (listes longues chargees en une fois). */
  batch?: number;
}>(), {
  rowLabel: undefined, rowClass: undefined, loading: false, labels: () => ({}),
  bulkActions: () => [], globalActions: () => [], hasMore: false, loadingMore: false,
  rowActions: null, inlineActions: 2, openable: false, initialSort: null, manualSort: false, columnsKey: '',
  defaultVisible: undefined, resizable: false, reorderable: false, density: 'comfortable', contextMenu: false, batch: 0,
});
const emit = defineEmits<{
  action: [key: string, rows: T[]];
  open: [row: T];
  'load-more': [];
  'update:sort': [value: UiSort | null];
}>();

const slots = useSlots();
const labels = computed(() => ({
  singular: props.labels.singular || 'élément sélectionné',
  plural: props.labels.plural || 'éléments sélectionnés',
  empty: props.labels.empty || 'Aucun élément',
  global: props.labels.global || 'Actions sur toute la liste',
}));
const nameOf = (row: T): string => (props.rowLabel ? props.rowLabel(row) : String(props.rowKey(row)));

const allColumns = computed<UiColumn<T>[]>(() => [
  ...props.columns,
  ...(props.rowActions ? [{ key: 'actions', label: 'Actions', required: true, card: 'actions' as const, className: 'control-table__actions-cell' }] : []),
]);
/* Les emplacements de cellule de la page, sauf ceux que le tableau tient lui-meme. */
const forwarded = computed(() => Object.keys(slots).filter((name) => name.startsWith('cell-') && !(props.rowActions && name === 'cell-actions')));

/* Colonnes memorisees : ordre, visibilite, largeurs. Deux colonnes au minimum : un tableau
   reduit a une colonne ne dit plus rien. */
const columnPrefs = props.columnsKey
  ? useTableColumns(() => props.columns, {
    storageKey: props.columnsKey,
    defaultVisible: props.defaultVisible,
    defaultWidths: Object.fromEntries(props.columns.filter((column) => column.width).map((column) => [column.key, column.width as number])),
    minimumVisible: 2,
  })
  : null;
const pickerOpen = ref(false);

const selected = ref<Array<string | number>>([]);
const selectedRows = computed(() => {
  const keys = new Set(selected.value.map(String));
  return props.rows.filter((row) => keys.has(String(props.rowKey(row))));
});
// Une ligne disparue (action, filtre) ne reste pas selectionnee en silence.
watch(() => props.rows, (rows) => {
  const present = new Set(rows.map((row) => String(props.rowKey(row))));
  if (selected.value.some((key) => !present.has(String(key)))) selected.value = selected.value.filter((key) => present.has(String(key)));
});

/* Ctrl+A selectionne toute la liste (ou la vide si elle l'est deja), hors champ de saisie. */
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (!props.bulkActions.length || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') return;
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  event.preventDefault();
  selected.value = selected.value.length === props.rows.length ? [] : props.rows.map(props.rowKey);
});

/* Rendu par paquets : on monte N lignes, puis N de plus tant que le defilement en demande. */
const shown = ref(props.batch);
const moreToLoad = computed(() => props.hasMore || (props.batch > 0 && shown.value < props.rows.length));
function loadMore(): void {
  if (props.batch > 0 && shown.value < props.rows.length) shown.value += props.batch;
  else emit('load-more');
}

/* Menu contextuel : un clic droit sur une ligne non cochee la selectionne seule ; le menu
   porte alors sur la selection (ses actions groupees) ou, pour une ligne, ses actions. */
const contextRow = ref<T | null>(null) as { value: T | null };
function onContextMenu(row: T): void {
  if (!props.contextMenu) return;
  if (!selected.value.map(String).includes(String(props.rowKey(row)))) selected.value = [props.rowKey(row)];
  contextRow.value = row;
}
const contextTargets = computed<T[]>(() => (selectedRows.value.length ? selectedRows.value : contextRow.value ? [contextRow.value] : []));
const flatten = (actions: ControlAction<T>[]): ControlAction<T>[] => actions.flatMap((action, index) => (action.items?.length
  ? action.items.map((item, position) => ({ ...item, separated: item.separated || (position === 0 && index > 0) }))
  : [{ ...action, separated: action.separated || index > 0 && Boolean(actions[index - 1].items?.length) }]));
const contextItems = computed<ControlAction<T>[]>(() => {
  const targets = contextTargets.value;
  if (targets.length === 1 && props.rowActions) return flatten(props.rowActions(targets[0]));
  return flatten(props.bulkActions);
});
const contextLabel = computed(() => (contextTargets.value.length > 1 ? `${contextTargets.value.length} ${labels.value.plural}` : contextRow.value ? nameOf(contextRow.value) : ''));

const inline = (row: T) => (props.rowActions ? props.rowActions(row).slice(0, props.inlineActions) : []);
const overflow = (row: T) => (props.rowActions ? props.rowActions(row).slice(props.inlineActions) : []);

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
/* Confirme si l'action le demande, emet, puis vide la selection pour une action groupee.
   Une action sur toute la liste n'a pas de ligne : elle part avec une liste vide. */
async function run(action: ControlAction<T>, targets: T[], scope: 'row' | 'bulk' | 'global'): Promise<void> {
  if (scope !== 'global' && !targets.length) return;
  const options = action.confirm?.(targets);
  if (options && !(await askConfirm(options))) return;
  emit('action', action.key, targets);
  if (scope === 'bulk') selected.value = [];
}

function onRowClick(row: T, _index: number, event: MouseEvent | KeyboardEvent): void {
  if (!props.openable) return;
  if ((event.target as HTMLElement | null)?.closest('button, a, input, [role="checkbox"], [role="menuitem"]')) return;
  emit('open', row);
}
</script>

<style scoped lang="scss">
.control-table { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); min-width: 0; }
.control-table__actions { display: inline-flex; align-items: center; gap: var(--space-1); }
.control-table__global { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); }
/* Une ligne a mettre en retrait (compte desactive) : la page la signale par `rowClass`. */
.control-table :deep(tbody tr.is-muted) { opacity: .62; }
</style>
