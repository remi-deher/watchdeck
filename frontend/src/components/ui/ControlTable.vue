<template>
  <!-- Tableau de contrôle : lire une liste de ressources durables ET agir dessus. C'est
       UiDataTable (lecture, tri, selection) auquel s'ajoutent, par definition de donnees :
         - la barre d'actions groupees (BulkActionBar) sur la selection ;
         - les actions d'une ligne : les deux premieres visibles, le reste dans « … » ;
         - la confirmation, quand l'action en demande une (`confirm`) ;
         - l'ouverture de la ligne (`open`).
       Il ne fait rien lui-meme : il emet `action(cle, lignes)` et la page agit. Les cellules
       propres a la page passent par les emplacements `cell-<cle>`. -->
  <div class="control-table">
    <BulkActionBar :count="selectedRows.length" :singular="labels.singular" :plural="labels.plural" @clear="selected = []">
      <ControlActions :actions="bulkActions" @run="(action) => run(action, selectedRows, 'bulk')" />
    </BulkActionBar>
    <!-- Sans selection, les actions qui portent sur toute la liste (vider la file…). -->
    <div v-if="globalActions.length && !selectedRows.length" class="control-table__global" role="toolbar" :aria-label="labels.global">
      <ControlActions :actions="globalActions" @run="(action) => run(action, [], 'global')" />
    </div>

    <UiDataTable
      class="panel"
      :label="label"
      :rows="rows"
      :columns="allColumns"
      :row-key="rowKey"
      :row-label="rowLabel"
      :row-class="rowClass"
      :clickable="openable"
      :selectable="bulkActions.length > 0"
      v-model:selection="selected"
      @row-click="onRowClick"
    >
      <template #empty><UiEmptyState v-if="!loading" :title="labels.empty" compact /></template>
      <template v-for="name in forwarded" :key="name" #[name]="scope"><slot :name="name" v-bind="scope || {}" /></template>
      <template v-if="hasMore" #after><InfiniteScrollTrigger :has-more="hasMore" :loading="loadingMore" @load="emit('load-more')" /></template>
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
              <UiButton icon-only title="Plus d’actions" :aria-label="`Plus d’actions pour ${nameOf(row)}`" @click.stop><Ellipsis /></UiButton>
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
import { Ellipsis } from '@lucide/vue';
import { useConfirm } from '@/composables/useConfirm';
import ConfirmModal from '@/components/ConfirmModal.vue';
import BulkActionBar from './BulkActionBar.vue';
import ControlActions from './ControlActions.vue';
import InfiniteScrollTrigger from './InfiniteScrollTrigger.vue';
import UiButton from './UiButton.vue';
import UiDataTable, { type UiColumn } from './UiDataTable.vue';
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
}>(), {
  rowLabel: undefined, rowClass: undefined, loading: false, labels: () => ({}),
  bulkActions: () => [], globalActions: () => [], hasMore: false, loadingMore: false,
  rowActions: null, inlineActions: 2, openable: false,
});
const emit = defineEmits<{
  action: [key: string, rows: T[]];
  open: [row: T];
  'load-more': [];
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
