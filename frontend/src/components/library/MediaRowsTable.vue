<template>
  <!-- Le serveur trie tout le catalogue filtre : le tableau ne fait qu'emettre la demande.
       Une meme ligne disait l'absence de trois facons differentes : « 0 · aucun »,
       « personne », « jamais ». Dans un tableau dense, la valeur vide s'ecrit toujours
       pareil -- le tiret cadratin -- et la formulation en toutes lettres reste pour le
       tiroir de detail, ou il y a la place de l'expliquer. -->
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
    @row-click="(row: any) => (details = row)"
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
        <input type="checkbox" :checked="column.required || visibleKeys.has(column.key)" :disabled="column.required" @change="toggleColumn(column.key)">
        <span>{{ column.label }}</span>
      </label>
    </div>
    <template #actions><UiButton variant="primary" @click="showColumnPicker = false">Valider</UiButton></template>
  </ModalShell>

  <DrawerShell v-if="details" eyebrow="Fichier média" :title="title(details)" @close="details = null">
    <section class="drawer-section">
      <h3>Média</h3>
      <dl class="detail-grid">
        <div><dt>Type</dt><dd>{{ mediaTypeLabel(details.media_type) }}</dd></div>
        <div><dt>Bibliothèque</dt><dd>{{ details.library || '—' }}</dd></div>
        <div><dt>Studio</dt><dd>{{ details.studio || '—' }}</dd></div>
        <div><dt>Année</dt><dd>{{ details.year || '—' }}</dd></div>
        <div><dt>Ajouté le</dt><dd>{{ formatDate(details.added_at) }}</dd></div>
        <div><dt>Durée</dt><dd>{{ duration(details.duration_ms) }}</dd></div>
      </dl>
    </section>
    <section class="drawer-section">
      <h3>Fichier</h3>
      <dl class="detail-grid">
        <div><dt>Poids</dt><dd>{{ bytes(details.size_bytes) }}</dd></div>
        <div><dt>Conteneur</dt><dd>{{ details.container || '—' }}</dd></div>
        <div><dt>Vidéo</dt><dd>{{ details.video_resolution || '—' }} · {{ details.video_codec || '—' }}</dd></div>
        <div><dt>Audio</dt><dd>{{ details.audio_codec || '—' }}<template v-if="details.audio_channels"> · {{ details.audio_channels }} canaux</template></dd></div>
        <div><dt>Pistes audio</dt><dd>{{ (details.audio_languages || []).join(', ') || 'aucune' }}</dd></div>
        <div><dt>Sous-titres</dt><dd>{{ (details.subtitle_types || details.subtitle_languages || []).join(', ') || 'aucun' }}</dd></div>
      </dl>
    </section>
    <section class="drawer-section">
      <h3>Audience</h3>
      <dl class="detail-list">
        <div><dt>Lectures</dt><dd>{{ details.play_count || 0 }}</dd></div>
        <div><dt>Temps visionné</dt><dd>{{ duration(details.watch_time_ms) }}</dd></div>
        <div><dt>Spectateurs</dt><dd>{{ (details.viewers || []).join(', ') || 'personne' }}</dd></div>
        <div><dt>Dernier visionnage</dt><dd>{{ details.last_viewed_at ? formatDate(details.last_viewed_at) : 'jamais' }}</dd></div>
      </dl>

      <!-- La fiche disait combien de fois un media avait ete vu, jamais quand. -->
      <ol v-if="(details.views || []).length" class="view-log">
        <li v-for="(view, index) in details.views" :key="`${view.at}-${index}`">
          <span>{{ view.user || 'Utilisateur Plex' }}</span>
          <time :datetime="view.at">{{ formatDate(view.at) }}</time>
          <strong>{{ duration(view.watched_ms) }}</strong>
        </li>
      </ol>
      <p v-else class="view-log-empty">Aucun visionnage enregistré pour ce fichier.</p>
    </section>
  </DrawerShell>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import DrawerShell from '@/components/DrawerShell.vue';
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

const details = ref<any | null>(null);
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

.drawer-section { margin-top: 22px; }
.drawer-section:first-child { margin-top: 8px; }
.drawer-section h3 { margin: 0 0 12px; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
.detail-grid div, .detail-list div { padding: 10px; border-radius: var(--radius-sm); background: var(--surface-2); }
.detail-grid dt, .detail-list dt { color: var(--muted); font-size: var(--fs-xs); }
.detail-grid dd, .detail-list dd { margin: 4px 0 0; font-weight: 700; }
.detail-list { display: grid; gap: var(--space-2); margin: 0; }
.view-log { display: grid; gap: 2px; margin: var(--space-3) 0 0; padding: 0; list-style: none; }
.view-log li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--space-3);
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-size: var(--fs-sm);
}
.view-log li:last-child { border-bottom: 0; }
.view-log span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.view-log time { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.view-log strong { font-variant-numeric: tabular-nums; }
.view-log-empty { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--fs-sm); }
@media (max-width: 520px) { .detail-grid { grid-template-columns: 1fr; } }
</style>
