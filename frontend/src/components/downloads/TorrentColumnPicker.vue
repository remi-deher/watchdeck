<template>
  <!-- Colonnes du tableau des torrents : visibilite, et ordre au glisser-deposer comme aux
       boutons haut/bas (l'equivalent au clavier). -->
  <ModalShell :open="open" title="Personnaliser les colonnes" subtitle="Sélectionnez les colonnes à afficher dans le tableau des torrents." @close="emit('close')">
    <div class="column-picker-grid">
      <div
        v-for="(col, index) in prefs.orderedColumns.value"
        :key="col.key"
        class="column-picker-item"
        :class="{ dragging: prefs.draggedKey.value === col.key }"
        draggable="true"
        @dragstart="prefs.startDrag(col.key, $event)"
        @dragover.prevent
        @drop="prefs.drop(col.key)"
      >
        <input
          type="checkbox"
          :checked="col.required || prefs.visibleKeys.value.has(col.key)"
          :disabled="col.required"
          @change="prefs.toggleColumn(col.key)"
        />
        <span>{{ col.label }}</span>
        <span class="column-reorder-buttons">
          <button type="button" class="column-reorder-btn" :disabled="index === 0" :aria-label="`Déplacer ${col.label} vers le haut`" @click="prefs.moveColumn(col.key, -1)"><ChevronUp /></button>
          <button type="button" class="column-reorder-btn" :disabled="index === prefs.orderedColumns.value.length - 1" :aria-label="`Déplacer ${col.label} vers le bas`" @click="prefs.moveColumn(col.key, 1)"><ChevronDown /></button>
        </span>
        <span class="column-drag-handle" aria-hidden="true">⠿</span>
      </div>
    </div>
    <template #actions>
      <UiButton variant="primary" @click="emit('close')">Valider</UiButton>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronUp } from '@lucide/vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import type { useTableColumns } from '@/composables/useTableColumns';

defineProps<{ open: boolean; prefs: ReturnType<typeof useTableColumns> }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<style scoped>
.column-picker-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:10px 0}
.column-picker-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius-sm);background:var(--surface-2);font-size:var(--fs-xs);user-select:none;cursor:grab}
.column-picker-item.dragging{opacity:.45}
.column-picker-item>span:not(.column-drag-handle):not(.column-reorder-buttons){flex:1}
.column-picker-item input{cursor:pointer}
.column-reorder-buttons{display:inline-flex;gap:2px}
.column-reorder-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:var(--radius-xs);background:transparent;color:var(--muted);cursor:pointer}
.column-reorder-btn:hover:not(:disabled){color:var(--text);background:var(--surface-3)}
.column-reorder-btn:disabled{opacity:.35;cursor:not-allowed}
.column-reorder-btn svg{width:14px;height:14px}
.column-drag-handle{color:var(--muted);font-size:18px;line-height:1}
@media(max-width:380px){.column-picker-grid{grid-template-columns:1fr}}
</style>
