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
      <template v-for="action in bulkActions" :key="action.key">
        <UiMenu v-if="action.items?.length" align="start">
          <template #trigger>
            <UiButton size="sm" :variant="variantOf(action)" :disabled="action.disabled">
              <template v-if="action.icon" #icon><component :is="action.icon" /></template>{{ action.label }}<template #trailing><ChevronDown /></template>
            </UiButton>
          </template>
          <template v-for="item in action.items" :key="item.key">
            <UiMenuSeparator v-if="item.separated" />
            <UiMenuItem :variant="item.tone === 'danger' ? 'danger' : 'default'" :disabled="item.disabled" @select="run(item, selectedRows, true)">
              <component :is="item.icon" v-if="item.icon" /> {{ item.label }}
            </UiMenuItem>
          </template>
        </UiMenu>
        <UiButton v-else size="sm" :variant="variantOf(action)" :disabled="action.disabled" :title="action.title" @click="run(action, selectedRows, true)">
          <template v-if="action.icon" #icon><component :is="action.icon" /></template>{{ action.label }}
        </UiButton>
      </template>
    </BulkActionBar>

    <UiDataTable
      class="panel"
      :label="label"
      :rows="rows"
      :columns="allColumns"
      :row-key="rowKey"
      :row-label="rowLabel"
      :row-class="rowClass"
      :clickable="openable"
      selectable
      v-model:selection="selected"
      @row-click="onRowClick"
    >
      <template #empty><UiEmptyState v-if="!loading" :title="labels.empty" compact /></template>
      <template v-for="name in forwarded" :key="name" #[name]="scope"><slot :name="name" v-bind="scope || {}" /></template>
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
            @click.stop="run(action, [row])"
          ><component :is="action.icon" v-if="action.icon" /><template v-else>{{ action.label }}</template></UiButton>
          <UiMenu v-if="overflow(row).length" :label="nameOf(row)">
            <template #trigger>
              <UiButton icon-only title="Plus d’actions" :aria-label="`Plus d’actions pour ${nameOf(row)}`" @click.stop><Ellipsis /></UiButton>
            </template>
            <template v-for="item in overflow(row)" :key="item.key">
              <UiMenuSeparator v-if="item.separated" />
              <UiMenuItem :variant="item.tone === 'danger' ? 'danger' : 'default'" :disabled="item.disabled" @select="run(item, [row])">
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
}
</script>

<script setup lang="ts" generic="T">
import { computed, ref, useSlots, watch } from 'vue';
import { ChevronDown, Ellipsis } from '@lucide/vue';
import { useConfirm } from '@/composables/useConfirm';
import ConfirmModal from '@/components/ConfirmModal.vue';
import BulkActionBar from './BulkActionBar.vue';
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
  /** Actions d'une ligne : les `inlineActions` premieres visibles, le reste dans « … ». */
  rowActions?: ((row: T) => ControlAction<T>[]) | null;
  inlineActions?: number;
  /** Un clic sur la ligne (hors boutons) l'ouvre : evenement `open`. */
  openable?: boolean;
}>(), {
  rowLabel: undefined, rowClass: undefined, loading: false, labels: () => ({}),
  bulkActions: () => [], rowActions: null, inlineActions: 2, openable: false,
});
const emit = defineEmits<{
  action: [key: string, rows: T[]];
  open: [row: T];
}>();

const slots = useSlots();
const labels = computed(() => ({
  singular: props.labels.singular || 'élément sélectionné',
  plural: props.labels.plural || 'éléments sélectionnés',
  empty: props.labels.empty || 'Aucun élément',
}));
const nameOf = (row: T): string => (props.rowLabel ? props.rowLabel(row) : String(props.rowKey(row)));
const variantOf = (action: ControlAction<T>) => (action.tone === 'danger' ? 'danger' : action.tone === 'primary' ? 'primary' : 'secondary');

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
/* Confirme si l'action le demande, emet, puis vide la selection pour une action groupee. */
async function run(action: ControlAction<T>, targets: T[], bulk = false): Promise<void> {
  if (!targets.length) return;
  const options = action.confirm?.(targets);
  if (options && !(await askConfirm(options))) return;
  emit('action', action.key, targets);
  if (bulk) selected.value = [];
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
/* Une ligne a mettre en retrait (compte desactive) : la page la signale par `rowClass`. */
.control-table :deep(tbody tr.is-muted) { opacity: .62; }
</style>
