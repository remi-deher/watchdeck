<template>
  <!-- Choix des colonnes d'un tableau : une liste unique, dans l'ordre du tableau. Chaque
       ligne se glisse (poignee), se deplace au clavier (fleches) et s'affiche ou se masque
       (interrupteur) ; une colonne masquee reste a sa place, estompee, pour qu'on la
       retrouve ou on l'avait laissee. -->
  <ModalShell :open="open" title="Personnaliser les colonnes" :subtitle="subtitle" panel-class="column-picker-panel" @close="emit('close')">
    <div class="column-picker">
      <div class="column-picker__summary">
        <span class="column-picker__count"><strong>{{ visibleCount }}</strong> sur {{ total }} colonnes affichées</span>
        <span class="column-picker__bulk">
          <UiButton size="sm" variant="ghost" :disabled="visibleCount === total" @click="showAll"><Eye />Tout afficher</UiButton>
          <UiButton size="sm" variant="ghost" :disabled="isDefault" @click="reset"><RotateCcw />Réinitialiser</UiButton>
        </span>
      </div>

      <ol class="column-picker__list" aria-label="Colonnes du tableau">
        <li
          v-for="(column, index) in prefs.orderedColumns.value"
          :key="column.key"
          class="column-row"
          :class="{
            'is-hidden': !isVisible(column),
            'is-dragging': prefs.draggedKey.value === column.key,
            'is-drop-target': prefs.dragOverKey.value === column.key,
          }"
          :draggable="true"
          @dragstart="prefs.startDrag(column.key, $event)"
          @dragover.prevent="prefs.dragOver(column.key, $event)"
          @dragleave="prefs.dragLeave(column.key)"
          @drop.prevent="prefs.drop(column.key)"
          @dragend="endDrag"
        >
          <span class="column-row__grip" aria-hidden="true"><GripVertical /></span>
          <span class="column-row__index" aria-hidden="true">{{ index + 1 }}</span>
          <span class="column-row__text">
            <strong>{{ column.label }}</strong>
            <small v-if="column.required"><Lock />Toujours affichée</small>
            <small v-else-if="column.hint">{{ column.hint }}</small>
          </span>
          <span class="column-row__move">
            <button type="button" :disabled="index === 0" :aria-label="`Monter ${column.label}`" title="Monter" @click="prefs.moveColumn(column.key, -1)"><ChevronUp /></button>
            <button type="button" :disabled="index === total - 1" :aria-label="`Descendre ${column.label}`" title="Descendre" @click="prefs.moveColumn(column.key, 1)"><ChevronDown /></button>
          </span>
          <ToggleSwitch
            :model-value="isVisible(column)"
            :disabled="column.required || (isVisible(column) && visibleCount <= 1)"
            :title="`Afficher la colonne ${column.label}`"
            @update:model-value="prefs.toggleColumn(column.key)"
          />
        </li>
      </ol>
    </div>
    <template #actions>
      <UiButton variant="primary" @click="emit('close')">Terminé</UiButton>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown, ChevronUp, Eye, GripVertical, Lock, RotateCcw } from '@lucide/vue';
import ModalShell from './ModalShell.vue';
import ToggleSwitch from './ToggleSwitch.vue';
import UiButton from './UiButton.vue';
import type { TableColumnLike, useTableColumns } from '@/composables/useTableColumns';

const props = withDefaults(
  defineProps<{
    open: boolean;
    prefs: ReturnType<typeof useTableColumns<TableColumnLike>>;
    /** Colonnes dans leur ordre d'origine : celui que retablit « Reinitialiser ». */
    defaults: TableColumnLike[];
    subtitle?: string;
  }>(),
  { subtitle: 'Glissez les lignes pour réordonner, et choisissez celles à afficher.' },
);
const emit = defineEmits<{ (e: 'close'): void }>();

const total = computed(() => props.prefs.orderedColumns.value.length);
const isVisible = (column: TableColumnLike): boolean => Boolean(column.required) || props.prefs.visibleKeys.value.has(column.key);
const visibleCount = computed(() => props.prefs.orderedColumns.value.filter(isVisible).length);
const defaultOrder = computed(() => props.defaults.map((column) => column.key));
const isDefault = computed(() =>
  visibleCount.value === total.value && props.prefs.columnOrder.value.join('|') === defaultOrder.value.join('|'),
);

function showAll(): void {
  props.prefs.visibleKeys.value = new Set(props.defaults.map((column) => column.key));
}
function reset(): void {
  props.prefs.columnOrder.value = [...defaultOrder.value];
  showAll();
}
/* Un lacher hors de la liste ne declenche pas `drop` : on efface quand meme l'indicateur. */
function endDrag(): void {
  props.prefs.draggedKey.value = '';
  props.prefs.dragOverKey.value = '';
}
</script>

<style scoped>
.column-picker{display:grid;gap:12px;padding-top:4px}
.column-picker__summary{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.column-picker__count{color:var(--muted);font-size:var(--fs-sm)}
.column-picker__count strong{color:var(--accent);font-family:var(--font-display);font-size:var(--fs-md)}
.column-picker__bulk{display:inline-flex;gap:4px}
.column-picker__list{display:grid;gap:4px;margin:0;padding:0;list-style:none;max-height:min(56vh,520px);overflow:auto}
.column-row{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgb(var(--ink) / 6%);border-radius:var(--inset-radius);background:var(--surface-2);cursor:grab;user-select:none;transition:opacity .15s,border-color .15s,background .15s}
.column-row:hover{border-color:rgb(var(--ink) / 14%)}
.column-row.is-hidden{background:transparent;border-style:dashed}
.column-row.is-hidden .column-row__text,.column-row.is-hidden .column-row__index{opacity:.5}
.column-row.is-dragging{opacity:.4}
.column-row.is-drop-target{border-color:var(--accent);box-shadow:inset 0 2px 0 var(--accent)}
.column-row__grip{display:inline-flex;color:var(--muted)}
.column-row__grip svg{width:16px;height:16px}
.column-row__index{min-width:22px;height:22px;display:inline-grid;place-items:center;border-radius:var(--radius-pill);background:rgb(var(--ink) / 7%);color:var(--muted);font-size:var(--fs-xs);font-variant-numeric:tabular-nums}
.column-row:not(.is-hidden) .column-row__index{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}
.column-row__text{display:grid;min-width:0}
.column-row__text strong{font-size:var(--fs-sm);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.column-row__text small{display:inline-flex;align-items:center;gap:4px;color:var(--muted);font-size:var(--fs-xs);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.column-row__text small svg{width:12px;height:12px;flex:none}
.column-row__move{display:inline-flex;gap:2px}
.column-row__move button{display:inline-grid;place-items:center;width:26px;height:26px;padding:0;border:0;border-radius:var(--radius-xs);background:transparent;color:var(--muted);cursor:pointer}
.column-row__move button:hover:not(:disabled){color:var(--text);background:var(--surface-3)}
.column-row__move button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.column-row__move button:disabled{opacity:.3;cursor:not-allowed}
.column-row__move svg{width:15px;height:15px}
@container panel (max-width: 380px) {
  .column-row{grid-template-columns:auto minmax(0,1fr) auto auto;gap:8px}
  .column-row__index{display:none}
}
</style>
