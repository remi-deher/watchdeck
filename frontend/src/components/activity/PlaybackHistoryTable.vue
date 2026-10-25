<template>
  <!-- Tableau de l'historique des lectures Plex (gabarit Comprendre, vue Tableau).
       Présentation tabulaire dense et claire, identique au tableau de l'inventaire :
       affiche en première colonne, typographie cohérente, pastilles de qualité,
       et barre de progression relative. -->
  <UiDataTable
    class="panel playback-history-table"
    label="Historique des lectures Plex"
    :rows="runs"
    :columns="COLUMNS"
    :row-key="(row: PlaybackRun) => row.key"
    :sort="tableSort"
    :row-class="rowClass"
    manual-sort
    clickable
    sticky-header
    :loading="loading"
    @update:sort="onSortChange"
    @row-click="emit('open', $event)"
  >
    <template #empty>
      <span class="history-empty">Aucune lecture ne correspond aux filtres actuels.</span>
    </template>

    <!-- 1. Colonne Titre (Média en tête de ligne, comme dans l'inventaire) -->
    <template #cell-title="{ row }">
      <span class="media-cell">
        <MediaArtwork
          :src="row.item.thumb_url || ''"
          :alt="title(row)"
          :type="row.item.media_type"
          size="small"
        />
        <span class="media-cell__text">
          <span class="media-title-line">
            <strong :title="title(row)">{{ title(row) }}</strong>
            <UiBadge v-if="row.count > 1" tone="accent" pill class="history-count-badge">
              ×{{ row.count }}
            </UiBadge>
          </span>
          <small v-if="subtitle(row)">{{ subtitle(row) }}</small>
        </span>
      </span>
    </template>

    <!-- 2. Colonne Date & Heure -->
    <template #cell-date="{ row }">
      <span class="date-cell">
        <strong>{{ formatDateDay(row.item.started_at) }}</strong>
        <small>{{ formatDateTime(row.item.started_at) }}</small>
      </span>
    </template>

    <!-- 3. Colonne Utilisateur -->
    <template #cell-user="{ row }">
      <span class="user-cell">
        <UiAvatar :person="{ name: row.item.user_name || 'Utilisateur' }" size="sm" tone="accent" />
        <span class="user-name">{{ row.item.user_name || 'Utilisateur Plex' }}</span>
      </span>
    </template>

    <!-- 4. Colonne Mode & Qualité (pastille de méthode + tags de qualité comme l'inventaire) -->
    <template #cell-method="{ row }">
      <span class="method-cell">
        <PlaybackMethodBadge :playback="row.item" :compact="true" />
        <span v-if="qualityTags(row.item).length" class="quality-tags">
          <span v-for="tag in qualityTags(row.item)" :key="tag" class="quality-tag">{{ tag }}</span>
        </span>
      </span>
    </template>

    <!-- 5. Colonne Progression (en miroir de la barre de taille de l'inventaire) -->
    <template #cell-duration="{ row }">
      <span class="progress-cell">
        <span>{{ formatWatched(row) }} <small v-if="progressPercent(row) > 0">({{ progressPercent(row) }} %)</small></span>
        <span class="progress-bar" aria-hidden="true"><i :style="{ width: `${progressPercent(row)}%` }" /></span>
      </span>
    </template>

    <!-- 6. Colonne Appareil -->
    <template #cell-device="{ row }">
      <span class="device-cell">
        <UiClientIdentity :client="row.item" />
      </span>
    </template>

    <!-- 7. Colonne Lieu & Débit -->
    <template #cell-location="{ row }">
      <span class="location-cell">
        <span v-if="row.item.bandwidth_kbps" class="location-bitrate">
          <Wifi class="location-meta-icon" aria-hidden="true" />
          {{ formatBandwidth(row.item.bandwidth_kbps) }}
        </span>
        <small class="location-place">
          <MapPin class="location-meta-icon" aria-hidden="true" />
          {{ playbackLocation(row.item) }}
        </small>
      </span>
    </template>
  </UiDataTable>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { MapPin, Wifi } from '@lucide/vue';
import UiDataTable, { type UiColumn, type UiSort } from '@/components/ui/UiDataTable.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiClientIdentity from '@/components/ui/UiClientIdentity.vue';
import MediaArtwork from '@/components/activity/MediaArtwork.vue';
import PlaybackMethodBadge from '@/components/activity/PlaybackMethodBadge.vue';
import { playbackLocation, type PlaybackRun, type HistoryItem } from '@/activity/playbackRuns';
import { formatBandwidth, formatDuration, formatDateTime, formatTime, parseApiDate } from '@/utils/format';
import { mediaTypeLabel } from '@/utils/labels';

const props = withDefaults(
  defineProps<{
    runs: PlaybackRun[];
    loading?: boolean;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
  }>(),
  {
    loading: false,
    sortKey: 'date',
    sortDirection: 'desc',
  },
);

const emit = defineEmits<{
  open: [run: PlaybackRun];
  'update:sort': [sort: { key: string; direction: 'asc' | 'desc' }];
}>();

const router = useRouter();

const openSessionId = computed(() => {
  const path = router?.currentRoute?.value?.path || '';
  return path.startsWith('/activity/session/') ? path.slice('/activity/session/'.length) : '';
});

const rowClass = (row: PlaybackRun): string =>
  openSessionId.value && String(row.item.id) === openSessionId.value ? 'is-open' : '';

const COLUMNS: UiColumn<PlaybackRun>[] = [
  { key: 'title', label: 'Titre', required: true, sortable: true, card: 'title' },
  { key: 'date', label: 'Date & Heure', sortable: true, className: 'col-narrow' },
  { key: 'user', label: 'Utilisateur', sortable: true, className: 'col-narrow' },
  { key: 'method', label: 'Mode & Qualité', sortable: true },
  { key: 'duration', label: 'Progression', sortable: true },
  { key: 'device', label: 'Appareil', sortable: true },
  { key: 'location', label: 'Débit & Lieu', sortable: false, className: 'col-narrow' },
];

const tableSort = computed<UiSort | null>(() => {
  if (!props.sortKey) return null;
  return { key: props.sortKey, direction: props.sortDirection || 'desc' };
});

function onSortChange(value: UiSort | null): void {
  if (value) {
    emit('update:sort', { key: value.key, direction: value.direction });
  }
}

function title(row: PlaybackRun): string {
  const item = row.item;
  if (item.grandparent_title) {
    return `${item.grandparent_title} · ${item.title || ''}`;
  }
  return item.title || 'Lecture Plex';
}

function subtitle(row: PlaybackRun): string {
  const item = row.item;
  const parts: string[] = [];
  if (item.season_number != null && item.episode_number != null) {
    parts.push(`S${item.season_number} · É${item.episode_number}`);
  }
  if (item.media_type) {
    parts.push(mediaTypeLabel(item.media_type));
  }
  if (item.library_name || item.library) {
    parts.push(item.library_name || item.library);
  } else if (item.year) {
    parts.push(String(item.year));
  }
  return parts.filter(Boolean).join(' · ');
}

function qualityTags(item: HistoryItem): string[] {
  const tags: string[] = [];
  if (item.quality) tags.push(String(item.quality));
  if (item.video_codec) tags.push(String(item.video_codec).toUpperCase());
  return tags;
}

function formatDateDay(iso?: string): string {
  if (!iso) return '—';
  const date = parseApiDate(iso);
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;

  const timeStr = formatTime(iso);
  if (dateKey === todayKey) return `Aujourd'hui, ${timeStr}`;
  if (dateKey === yesterdayKey) return `Hier, ${timeStr}`;

  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${date.getDate()} ${months[date.getMonth()]}, ${timeStr}`;
}

function progressPercent(run: PlaybackRun): number {
  const total = Number(run.item.duration_ms) || 0;
  if (!total) {
    return typeof run.item.progress === 'number' ? Math.min(100, Math.max(0, run.item.progress)) : 0;
  }
  return Math.min(100, Math.max(0, Math.round((run.watchedMs / total) * 100)));
}

function formatWatched(run: PlaybackRun): string {
  const total = Number(run.item.duration_ms) || 0;
  if (!total) return formatDuration(run.watchedMs);
  return `${formatDuration(run.watchedMs)} sur ${formatDuration(total)}`;
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

:deep(td.card-title), :deep(th.card-title) { min-width: 240px; }
:deep(td.card-title strong) { display: inline-block; overflow-wrap: anywhere; }
:deep(td.col-narrow), :deep(th.col-narrow) { width: 1%; white-space: nowrap; }
:deep(tbody td) { vertical-align: middle; }
:deep(tr.is-open td) { background: color-mix(in srgb, var(--accent) 8%, transparent); }
:deep(tr.is-open td:first-child) { box-shadow: inset 3px 0 0 var(--accent); }

/* Média (identique à MediaRowsTable) */
.media-cell { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.media-cell__text { display: grid; gap: 2px; min-width: 0; }
.media-title-line { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.media-title-line strong { font-size: var(--fs-sm); font-weight: 600; color: var(--text); }
.media-cell__text small { color: var(--muted); font-size: var(--fs-xs); }
.history-count-badge { font-size: var(--fs-xs); padding: 0 5px; }

/* Date */
.date-cell {
  display: grid;
  gap: 2px;
  min-width: 0;
  strong { font-size: var(--fs-sm); font-weight: 600; color: var(--text); white-space: nowrap; }
  small { font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; }
}

/* Utilisateur */
.user-cell { display: inline-flex; align-items: center; gap: var(--space-2); min-width: 0; }
.user-name { font-size: var(--fs-sm); color: var(--text); white-space: nowrap; }

/* Mode & Qualité */
.method-cell { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.quality-tags { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.quality-tag {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-3);
  font-size: var(--fs-xs);
  font-weight: 650;
  white-space: nowrap;
  color: var(--text-secondary, var(--text));
}

/* Progression (en miroir de size-cell / size-bar de MediaRowsTable) */
.progress-cell { display: inline-grid; gap: 5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.progress-cell span { font-size: var(--fs-sm); color: var(--text); }
.progress-cell small { margin-left: 2px; font-weight: 600; color: var(--text); }
.progress-bar { display: block; width: 72px; height: 4px; overflow: hidden; border-radius: var(--radius-pill); background: var(--surface-3); }
.progress-bar i { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
:deep(tr.is-open) .progress-bar i { background: var(--accent); }

/* Appareil */
.device-cell { font-size: var(--fs-sm); color: var(--text); white-space: nowrap; }

/* Lieu & Débit */
.location-cell { display: grid; gap: 2px; min-width: 0; }
.location-bitrate, .location-place {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-xs);
  color: var(--muted);
  white-space: nowrap;
}
.location-meta-icon { width: 12px; height: 12px; flex-shrink: 0; opacity: 0.75; }

.history-empty { color: var(--muted); font-size: var(--fs-sm); padding: var(--space-4); display: block; }
</style>
