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
    :row-class="rowClass"
    @update:sort="(value) => value && emit('update:sort', value)"
    @row-click="openDetails"
  >
    <template #empty>Aucun fichier ne correspond aux filtres.</template>
    <template #cell-title="{ row }">
      <span class="media-cell">
        <MediaArtwork :src="row.thumb_url || ''" :alt="''" :type="row.media_type" size="small" />
        <span class="media-cell__text"><strong>{{ title(row) }}</strong><small>{{ subtitle(row) }}</small></span>
      </span>
    </template>
    <template #cell-video="{ row }">
      <span v-if="quality(row).length" class="quality-tags">
        <span v-for="(tag, index) in quality(row)" :key="tag" class="quality-tag" :class="{ 'is-accent': index === 0 && isHighDefinition(row) }">{{ tag }}</span>
      </span>
      <template v-else>—</template>
    </template>
    <template #cell-audio="{ row }">{{ [row.audio_codec, (row.audio_languages || []).join(', '), row.audio_track_count ? `${row.audio_track_count} piste(s)` : ''].filter(Boolean).join(' · ') || '—' }}</template>
    <template #cell-subtitles="{ row }">{{ row.subtitle_count ? [`${row.subtitle_count}`, (row.subtitle_types || row.subtitle_languages || []).join(', ')].filter(Boolean).join(' · ') : '—' }}</template>
    <template #cell-size_bytes="{ row }">
      <span class="size-cell">{{ bytes(row.size_bytes) }}<span class="size-bar" aria-hidden="true"><i :style="{ width: `${sizeShare(row)}%` }"></i></span></span>
    </template>
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
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { etatDeVoisins, ouvrirFiche } from '@/composables/useMediaOverlay';
import MediaArtwork from '@/components/activity/MediaArtwork.vue';
import { codecLabel } from '@/utils/conversionVerdict';
import { resolutionLabel } from '@/utils/mediaTechnical';
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

const props = withDefaults(
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
  { key: 'video', label: 'Qualité', sortable: true },
  { key: 'audio', label: 'Audio', sortable: true },
  { key: 'container', label: 'Conteneur', sortable: true, className: 'col-narrow' },
  { key: 'subtitles', label: 'Sous-titres', sortable: true },
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
  if (!row?.rating_key) return;
  // Les lignes chargees voyagent avec la fiche : ses fleches (et j / k) passent au
  // fichier voisin sans refermer la feuille.
  const ids = props.items.map((item: any) => item.rating_key).filter(Boolean);
  ouvrirFiche(router, `/analytics/item/${encodeURIComponent(row.rating_key)}`, route.fullPath, etatDeVoisins(ids));
}
/* La ligne dont la fiche est ouverte reste marquee sous la feuille. `currentRoute` et non
   `useRoute()` : rendue en fond, la page recoit la route de fond, pas celle de la fiche. */
const openKey = computed(() => {
  const path = router.currentRoute.value.path;
  return path.startsWith('/analytics/item/') ? decodeURIComponent(path.slice('/analytics/item/'.length)) : '';
});
const rowClass = (row: any): string => (openKey.value && row.rating_key === openKey.value ? 'is-open' : '');
const showColumnPicker = ref(false);
const { orderedColumns, visibleColumns, visibleKeys, toggleColumn } = useTableColumns(
  () => columns,
  { storageKey: 'watchdeck:data-table-columns:library-inventory' },
);
defineExpose({ openColumnPicker: () => { showColumnPicker.value = true; } });

const title = (row: any): string => (row.grandparent_title ? `${row.grandparent_title} · ${row.title}` : row.title);
const known = (value: unknown): boolean => Boolean(value) && !/^inconnue?$/i.test(String(value));
const subtitle = (row: any): string => [mediaTypeLabel(row.media_type), row.year, row.library].filter(Boolean).join(' · ');
const isHighDefinition = (row: any): boolean => /^(4k|8k|2160|1440)$/i.test(String(row.video_resolution || ''));
const quality = (row: any): string[] => [
  resolutionLabel(row.video_resolution),
  known(row.video_codec) ? codecLabel(row.video_codec) : '',
  known(row.container) ? String(row.container).toUpperCase() : '',
].filter(Boolean);
/* Barre de poids relative au plus lourd des fichiers affiches : on repere d'un coup
   d'oeil ce qui pese, sans lire chaque valeur. */
const largest = computed(() => Math.max(1, ...props.items.map((row: any) => Number(row.size_bytes || 0))));
const sizeShare = (row: any): number => Math.round((Number(row.size_bytes || 0) / largest.value) * 100);
</script>

<style scoped lang="scss">
/* Les colonnes se partageaient la largeur a parts egales : « Studio : Inconnu » et
   « Conteneur : mkv » prenaient autant de place que le titre, qui se repliait alors sur
   six lignes et faisait passer certaines rangees a 400px de haut. On donne au titre la
   largeur qu'il demande, et on empeche les colonnes courtes de s'etaler. */
:deep(td.card-title), :deep(th.card-title) { min-width: 240px; }
:deep(td.card-title strong) { display: block; overflow-wrap: anywhere; }
:deep(td.col-narrow), :deep(th.col-narrow) { width: 1%; white-space: nowrap; }
:deep(tbody td) { vertical-align: middle; }
:deep(tr.is-open td) { background: color-mix(in srgb, var(--accent) 8%, transparent); }
:deep(tr.is-open td:first-child) { box-shadow: inset 3px 0 0 var(--accent); }
.media-cell { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.media-cell__text { display: grid; gap: 2px; min-width: 0; }
.media-cell__text small { color: var(--muted); font-size: var(--fs-xs); }
.quality-tags { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.quality-tag { display: inline-flex; align-items: center; min-height: 20px; padding: 0 6px; border-radius: var(--radius-xs); background: var(--surface-3); font-size: var(--fs-xs); font-weight: 650; white-space: nowrap; }
.quality-tag.is-accent { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
.size-cell { display: inline-grid; gap: 5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.size-bar { display: block; width: 72px; height: 4px; overflow: hidden; border-radius: var(--radius-pill); background: var(--surface-3); }
.size-bar i { display: block; height: 100%; border-radius: inherit; background: var(--muted); }
:deep(tr.is-open) .size-bar i { background: var(--accent); }

</style>
