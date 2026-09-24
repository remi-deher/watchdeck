<template>
  <!-- Le serveur trie tout le catalogue filtre : le tableau ne fait qu'emettre la demande.
       Une meme ligne disait l'absence de trois facons differentes : « 0 · aucun »,
       « personne », « jamais ». Dans un tableau dense, la valeur vide s'ecrit toujours
       pareil -- le tiret cadratin -- et la formulation en toutes lettres reste pour le
       fiche de detail, ou il y a la place de l'expliquer. -->
  <UiDataTable
    class="panel media-rows-table"
    label="Fichiers média"
    :rows="items"
    :columns="visibleColumns"
    :row-key="(row: any) => row.id ?? `${row.rating_key}-${row.file_path}`"
    :sort="sortKey ? { key: sortKey, direction: sortDirection } : null"
    manual-sort
    clickable
    @update:sort="(value) => value && emit('update:sort', value)"
    @row-click="openDetails"
  >
    <template #empty>Aucun fichier ne correspond aux filtres.</template>
    <template #cell-title="{ row }"><strong>{{ title(row) }}</strong><small>{{ mediaTypeLabel(row.media_type) }}</small></template>
    <template #cell-video="{ row }">{{ [row.video_resolution, row.video_codec].filter(Boolean).join(' · ') || '—' }}</template>
    <template #cell-audio="{ row }">{{ [row.audio_codec, (row.audio_languages || []).join(', '), row.audio_track_count ? `${row.audio_track_count} piste(s)` : ''].filter(Boolean).join(' · ') || '—' }}</template>
    <template #cell-subtitles="{ row }">{{ row.subtitle_count ? [`${row.subtitle_count}`, (row.subtitle_types || row.subtitle_languages || []).join(', ')].filter(Boolean).join(' · ') : '—' }}</template>
    <template #cell-size_bytes="{ row }">{{ bytes(row.size_bytes) }}</template>
    <template #cell-plays="{ row }">{{ row.play_count ? `${row.play_count} lecture(s)` : '—' }}</template>
    <template #cell-viewer="{ row }">{{ (row.viewers || []).join(', ') || '—' }}</template>
    <template #cell-last_viewed="{ row }">{{ row.last_viewed_at ? formatDate(row.last_viewed_at) : '—' }}</template>
  </UiDataTable>

  <ModalShell :open="showColumnPicker" title="Personnaliser les colonnes" subtitle="Choisissez et réordonnez les colonnes affichées." @close="showColumnPicker = false">
    <div class="column-picker-grid">
      <label v-for="column in orderedColumns" :key="column.key" class="column-picker-item">
        <UiCheckbox :model-value="column.required || visibleKeys.has(column.key)" :disabled="column.required" @update:model-value="toggleColumn(column.key)" />
        <span>{{ column.label }}</span>
      </label>
    </div>
    <template #actions><UiButton variant="primary" @click="showColumnPicker = false">Valider</UiButton></template>
  </ModalShell>

</template>

<script setup lang="ts">
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { useTableColumns } from '@/composables/useTableColumns';
import { mediaTypeLabel } from '@/utils/labels';
import {
  formatDateTime as formatDate,
  formatDurationRoundHours as duration,
  formatFileSize as bytes,
} from '@/utils/format';

withDefaults(
  defineProps<{
    items?: any[];
    /** Tri courant, applique par le serveur sur tout le catalogue filtre. */
    sortKey?: string | null;
    sortDirection?: 'asc' | 'desc';
  }>(),
  {
    items: () => [],
    sortKey: undefined,
    sortDirection: 'asc',
  }
);

const emit = defineEmits<{
  (e: 'update:sort', value: { key: string; direction: 'asc' | 'desc' }): void;
}>();

const columns: UiColumn[] = [
  { key: 'title', label: 'Titre', required: true, sortable: true, card: 'title' },
  { key: 'library', label: 'Bibliothèque', sortable: true, className: 'col-narrow' },
  { key: 'studio', label: 'Studio', sortable: true, className: 'col-narrow' },
  { key: 'video', label: 'Qualité' },
  { key: 'audio', label: 'Audio' },
  { key: 'container', label: 'Conteneur', sortable: true, className: 'col-narrow' },
  { key: 'subtitles', label: 'Sous-titres' },
  { key: 'size_bytes', label: 'Poids', sortable: true },
  { key: 'plays', label: 'Lectures', sortable: true },
  { key: 'viewer', label: 'Spectateurs', sortable: true },
  { key: 'last_viewed', label: 'Dernier visionnage', sortable: true },
];

/* La fiche technique d'un fichier s'ouvre dans la feuille, avec sa propre adresse
   (voir AnalyticsItemView). */
const route = useRoute();
const router = useRouter();
function openDetails(row: any): void {
  if (row?.rating_key) ouvrirFiche(router, `/analytics/item/${encodeURIComponent(row.rating_key)}`, route.fullPath);
}
const showColumnPicker = ref(false);
const { orderedColumns, visibleColumns, visibleKeys, toggleColumn } = useTableColumns(
  () => columns,
  { storageKey: 'watchdeck:data-table-columns:library-inventory' },
);
defineExpose({ openColumnPicker: () => { showColumnPicker.value = true; } });

const title = (row: any): string => (row.grandparent_title ? `${row.grandparent_title} · ${row.title}` : row.title);
</script>

<style scoped lang="scss">
/* Les colonnes se partageaient la largeur a parts egales : « Studio : Inconnu » et
   « Conteneur : mkv » prenaient autant de place que le titre, qui se repliait alors sur
   six lignes et faisait passer certaines rangees a 400px de haut. On donne au titre la
   largeur qu'il demande, et on empeche les colonnes courtes de s'etaler. */
:deep(td.card-title), :deep(th.card-title) { min-width: 240px; }
:deep(td.card-title strong) { display: block; overflow-wrap: anywhere; }
:deep(tbody td) { vertical-align: top; }
:deep(td.col-narrow), :deep(th.col-narrow) { width: 1%; white-space: nowrap; }

</style>
