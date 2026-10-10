<template>
  <!-- Gabarit « Gérer » : répond à « comment je tiens à jour ce parc ? ». Ce que Traiter
       trie par urgence disparaît une fois réglé ; ce que Gérer montre dure (comptes,
       clients, tâches) : on le lit, on le corrige, on agit sur un seul ou sur plusieurs.
         1. les situations à traiter, en une rangée juste au-dessus de la liste qu'elles
            filtrent (« Tous » d'abord, chacune avec son nombre) ;
         2. le tableau de contrôle (ControlTable) : actions groupées sur la sélection,
            actions d'une ligne (deux visibles, le reste dans « … »), confirmation quand
            l'action en demande une, ouverture de la fiche au clic, actions sur toute la liste
            quand rien n'est coché, chargement par paquets au défilement.
       La page fournit `rows`, `columns`, `bulkActions`, `rowActions`, le contenu des
       cellules (emplacements `cell-<clé>`) et réagit à `action` et `open`. Les retours
       (réussite, échec) passent par `useToast`, jamais par un bandeau dans la page. -->
  <div class="manage">
    <UiSegmentedControl
      v-if="situations.length"
      class="manage__situations"
      ariaLabel="Situations à traiter"
      :model-value="situation || ALL"
      :options="options"
      @update:model-value="situation = $event === ALL ? '' : String($event)"
    />
    <!-- Ce qui altere la lecture de la liste (client injoignable, donnees en cache). -->
    <UiFeedback v-for="notice in notices" :key="notice.key" :type="notice.type" :title="notice.title" :message="notice.message" />
    <ControlTable
      :label="label"
      :rows="rows"
      :columns="columns"
      :row-key="rowKey"
      :row-label="rowLabel"
      :row-class="rowClass"
      :loading="loading"
      :labels="labels"
      :bulk-actions="bulkActions"
      :global-actions="globalActions"
      :row-actions="rowActions"
      :openable="openable"
      :inline-actions="inlineActions"
      :initial-sort="initialSort"
      :columns-key="columnsKey"
      :default-visible="defaultVisible"
      :resizable="resizable"
      :reorderable="reorderable"
      :density="density"
      :context-menu="contextMenu"
      :batch="batch"
      :has-more="hasMore"
      :loading-more="loadingMore"
      @action="(key, targets) => emit('action', key, targets)"
      @open="emit('open', $event)"
      @load-more="emit('load-more')"
    >
      <template v-for="name in Object.keys($slots)" :key="name" #[name]="scope"><slot :name="name" v-bind="scope || {}" /></template>
    </ControlTable>
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed } from 'vue';
import ControlTable, { type ControlAction, type ControlLabels } from '@/components/ui/ControlTable.vue';
import type { UiColumn, UiSort } from '@/components/ui/UiDataTable.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';

export type { ControlAction, ControlLabels } from '@/components/ui/ControlTable.vue';

/** Un bandeau d'état de la liste. */
export interface ManageNotice {
  key: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title?: string;
  message: string;
}

/** Une situation à traiter : sert de filtre et dit combien d'éléments elle touche. */
export interface ManageSituation {
  value: string;
  label: string;
  count: number;
}

const props = withDefaults(defineProps<{
  rows: T[];
  columns: UiColumn<T>[];
  rowKey: (row: T) => string | number;
  /** Nom accessible du tableau. */
  label: string;
  rowLabel?: (row: T) => string;
  rowClass?: (row: T) => string | Record<string, boolean> | undefined;
  loading?: boolean;
  labels?: ControlLabels & { all?: string };
  situations?: ManageSituation[];
  /** Éléments au total, avant filtre : le nombre de « Tous ». */
  total?: number;
  bulkActions?: ControlAction<T>[];
  /** Actions sur toute la liste, quand rien n'est coché (`action(clé, [])`). */
  globalActions?: ControlAction<T>[];
  hasMore?: boolean;
  loadingMore?: boolean;
  rowActions?: ((row: T) => ControlAction<T>[]) | null;
  openable?: boolean;
  inlineActions?: number;
  initialSort?: UiSort | null;
  /** Colonnes personnalisables et memorisees sous cette cle (voir ControlTable). */
  columnsKey?: string;
  defaultVisible?: string[];
  resizable?: boolean;
  reorderable?: boolean;
  density?: 'comfortable' | 'compact';
  contextMenu?: boolean;
  batch?: number;
  /** Bandeaux au-dessus de la liste : ce qui altere sa lecture. */
  notices?: ManageNotice[];
}>(), {
  rowLabel: undefined, rowClass: undefined, loading: false, labels: () => ({}),
  situations: () => [], total: undefined, bulkActions: () => [], globalActions: () => [],
  hasMore: false, loadingMore: false, rowActions: null, openable: false, inlineActions: 2, initialSort: null, columnsKey: '',
  defaultVisible: undefined, resizable: false, reorderable: false, density: 'comfortable', contextMenu: false, batch: 0, notices: () => [],
});
const emit = defineEmits<{
  action: [key: string, rows: T[]];
  open: [row: T];
  'load-more': [];
}>();
/** Situation retenue ; vide pour « Tous ». */
const situation = defineModel<string>('situation', { default: '' });

/* Le contrôle segmenté ignore la valeur vide : « Tous » a donc sa propre clé. */
const ALL = 'all';
const options = computed(() => [
  { value: ALL, label: props.labels.all || 'Tous', count: props.total ?? props.rows.length },
  ...props.situations,
]);
</script>

<style scoped lang="scss">
.manage { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); min-width: 0; }
.manage__situations { justify-self: start; }
</style>
