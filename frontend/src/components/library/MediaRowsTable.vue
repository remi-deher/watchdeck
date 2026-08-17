<template>
  <DataTable
    ref="tableRef"
    :columns="columns"
    :rows="items"
    :row-key="rowKey"
    preference-scope="library-inventory"
    default-sort-key="title"
    clickable-rows
    aria-label="Fichiers média"
    @row-click="details = $event"
  >
    <template #cell-title="{ row }"><strong>{{ title(row) }}</strong><small>{{ mediaTypeLabel(row.media_type) }}</small></template>
    <template #cell-video="{ row }">{{ row.video_resolution || '—' }} · {{ row.video_codec || '—' }}</template>
    <template #cell-audio="{ row }">{{ row.audio_codec || '—' }} · {{ (row.audio_languages || []).join(', ') || 'langue inconnue' }} · {{ row.audio_track_count || 0 }} piste(s)</template>
    <template #cell-subtitles="{ row }">{{ row.subtitle_count || 0 }} · {{ (row.subtitle_types || row.subtitle_languages || []).join(', ') || 'aucun' }}</template>
    <template #cell-size_bytes="{ row }">{{ bytes(row.size_bytes) }}</template>
    <template #cell-plays="{ row }">{{ row.play_count || 0 }} lecture(s) · {{ (row.viewers || []).join(', ') || 'personne' }}</template>
    <template #empty>Aucun fichier ne correspond aux filtres.</template>
  </DataTable>

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
      </dl>
    </section>
  </DrawerShell>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable.vue';
import DrawerShell from '@/components/DrawerShell.vue';
import { mediaTypeLabel } from '@/utils/labels';
import {
  formatDateTime as formatDate,
  formatDurationRoundHours as duration,
  formatFileSize as bytes,
} from '@/utils/format';

withDefaults(
  defineProps<{
    items?: any[];
  }>(),
  {
    items: () => [],
  }
);

const columns: DataTableColumn[] = [
  { key: 'title', label: 'Titre', required: true, className: 'card-title' },
  { key: 'library', label: 'Bibliothèque' },
  { key: 'studio', label: 'Studio' },
  { key: 'video', label: 'Qualité', sortable: false },
  { key: 'audio', label: 'Audio', sortable: false },
  { key: 'container', label: 'Conteneur' },
  { key: 'subtitles', label: 'Sous-titres', sortable: false },
  { key: 'size_bytes', label: 'Poids' },
  { key: 'plays', label: 'Audience', sortable: false },
];

const details = ref<any | null>(null);
const tableRef = ref<{ openColumnPicker: () => void } | null>(null);
defineExpose({ openColumnPicker: () => tableRef.value?.openColumnPicker() });

const rowKey = (row: any): string => `${row.rating_key}:${row.title}`;
const title = (row: any): string => (row.grandparent_title ? `${row.grandparent_title} · ${row.title}` : row.title);
</script>

<style scoped lang="scss">
.drawer-section { margin-top: 22px; }
.drawer-section:first-child { margin-top: 8px; }
.drawer-section h3 { margin: 0 0 12px; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
.detail-grid div, .detail-list div { padding: 10px; border-radius: var(--radius-sm); background: var(--surface-2); }
.detail-grid dt, .detail-list dt { color: var(--muted); font-size: var(--fs-xs); }
.detail-grid dd, .detail-list dd { margin: 4px 0 0; font-weight: 700; }
.detail-list { display: grid; gap: var(--space-2); margin: 0; }
@media (max-width: 520px) { .detail-grid { grid-template-columns: 1fr; } }
</style>
