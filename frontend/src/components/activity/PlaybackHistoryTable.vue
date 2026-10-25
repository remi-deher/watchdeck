<template>
  <!-- Tableau de l'historique des lectures (gabarit Comprendre, vue Tableau).
       Présentation tabulaire dense, scannable et triable : date, média, spectateur,
       progression, mode de lecture, appareil client et débit/localisation. -->
  <div class="playback-history-table">
    <UiDataTable
      label="Historique des lectures Plex"
      :rows="runs"
      :columns="COLUMNS"
      :row-key="(row: PlaybackRun) => row.key"
      :sort="tableSort"
      manual-sort
      clickable
      sticky-header
      density="compact"
      :loading="loading"
      @update:sort="onSortChange"
      @row-click="emit('open', $event)"
    >
      <template #empty>
        <span class="history-empty">Aucune lecture ne correspond aux filtres actuels.</span>
      </template>

      <!-- Colonne Date & Heure -->
      <template #cell-date="{ row }">
        <span class="history-date-cell">
          <strong>{{ formatDateDay(row.item.started_at) }}</strong>
          <small>{{ formatDateTime(row.item.started_at) }}</small>
        </span>
      </template>

      <!-- Colonne Média -->
      <template #cell-title="{ row }">
        <div class="history-media-cell">
          <MediaArtwork
            :src="row.item.thumb_url || ''"
            :alt="playbackDisplayTitle(row.item)"
            :type="row.item.media_type"
            size="small"
          />
          <div class="history-media-text">
            <span class="history-media-title-row">
              <strong class="history-media-title" :title="playbackDisplayTitle(row.item)">
                {{ playbackDisplayTitle(row.item) }}
              </strong>
              <UiBadge v-if="row.count > 1" tone="accent" pill class="history-count-badge">
                ×{{ row.count }}
              </UiBadge>
            </span>
            <small v-if="mediaSubtitle(row.item)" class="history-media-subtitle">
              {{ mediaSubtitle(row.item) }}
            </small>
          </div>
        </div>
      </template>

      <!-- Colonne Utilisateur -->
      <template #cell-user="{ row }">
        <span class="history-user-cell">
          <UiAvatar :person="{ name: row.item.user_name || 'Utilisateur' }" size="sm" tone="accent" />
          <span class="history-user-name">{{ row.item.user_name || 'Utilisateur Plex' }}</span>
        </span>
      </template>

      <!-- Colonne Progression / Durée -->
      <template #cell-duration="{ row }">
        <div class="history-progress-cell">
          <div class="history-progress-bar">
            <i :style="{ width: `${progressPercent(row)}%` }" />
          </div>
          <span class="history-progress-text">
            {{ formatWatched(row) }}
            <small v-if="progressPercent(row) > 0">({{ progressPercent(row) }} %)</small>
          </span>
        </div>
      </template>

      <!-- Colonne Mode & Qualité -->
      <template #cell-method="{ row }">
        <div class="history-method-cell">
          <PlaybackMethodBadge :playback="row.item" :compact="true" />
          <small v-if="formatQuality(row.item)" class="history-quality-text">
            {{ formatQuality(row.item) }}
          </small>
        </div>
      </template>

      <!-- Colonne Appareil -->
      <template #cell-device="{ row }">
        <span class="history-device-cell">
          <UiClientIdentity :client="row.item" />
        </span>
      </template>

      <!-- Colonne Lieu & Débit -->
      <template #cell-location="{ row }">
        <div class="history-location-cell">
          <span v-if="row.item.bandwidth_kbps" class="history-bitrate">
            <Wifi class="history-meta-icon" aria-hidden="true" />
            {{ formatBandwidth(row.item.bandwidth_kbps) }}
          </span>
          <small class="history-location">
            <MapPin class="history-meta-icon" aria-hidden="true" />
            {{ playbackLocation(row.item) }}
          </small>
        </div>
      </template>
    </UiDataTable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MapPin, Wifi } from '@lucide/vue';
import UiDataTable, { type UiColumn, type UiSort } from '@/components/ui/UiDataTable.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiClientIdentity from '@/components/ui/UiClientIdentity.vue';
import MediaArtwork from '@/components/activity/MediaArtwork.vue';
import PlaybackMethodBadge from '@/components/activity/PlaybackMethodBadge.vue';
import { playbackDisplayTitle, playbackLocation, type PlaybackRun, type HistoryItem } from '@/activity/playbackRuns';
import { formatBandwidth, formatDuration, formatDateTime, formatTime, parseApiDate } from '@/utils/format';

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

const COLUMNS: UiColumn<PlaybackRun>[] = [
  { key: 'date', label: 'Date & Heure', sortable: true, width: 140, card: 'title' },
  { key: 'title', label: 'Média', sortable: true, width: 280, card: 'title' },
  { key: 'user', label: 'Utilisateur', sortable: true, width: 140, card: 'field' },
  { key: 'duration', label: 'Progression', sortable: true, width: 160, card: 'field' },
  { key: 'method', label: 'Mode & Qualité', sortable: true, width: 160, card: 'field' },
  { key: 'device', label: 'Appareil', sortable: true, width: 170, card: 'field' },
  { key: 'location', label: 'Débit & Lieu', sortable: false, width: 150, card: 'field' },
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

function mediaSubtitle(item: HistoryItem): string {
  if (item.season_number != null && item.episode_number != null) {
    return `S${item.season_number} · É${item.episode_number}${item.title ? ` · ${item.title}` : ''}`;
  }
  if (item.year) return String(item.year);
  return '';
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

function formatQuality(item: HistoryItem): string {
  return [item.quality, item.video_codec && String(item.video_codec).toUpperCase()].filter(Boolean).join(' · ');
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.playback-history-table {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  overflow: hidden;
}

.history-empty {
  color: var(--muted);
  font-size: var(--fs-sm);
  padding: var(--space-4);
  display: block;
}

/* Date */
.history-date-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
  }

  small {
    font-size: var(--fs-xs);
    color: var(--muted);
    white-space: nowrap;
  }
}

/* Média */
.history-media-cell {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.history-media-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.history-media-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.history-media-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-count-badge {
  font-size: var(--fs-xs);
  padding: 0 5px;
}

.history-media-subtitle {
  font-size: var(--fs-xs);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Utilisateur */
.history-user-cell {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.history-user-name {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Progression */
.history-progress-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: 140px;
}

.history-progress-bar {
  width: 100%;
  height: 4px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--text) 10%, transparent);
  overflow: hidden;

  i {
    display: block;
    height: 100%;
    border-radius: var(--radius-pill);
    background: var(--accent);
    transition: width var(--motion-duration-fast, 150ms) ease;
  }
}

.history-progress-text {
  font-size: var(--fs-xs);
  color: var(--muted);
  white-space: nowrap;

  small {
    margin-left: 2px;
    font-weight: 600;
    color: var(--text);
  }
}

/* Mode & Qualité */
.history-method-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
}

.history-quality-text {
  font-size: var(--fs-xs);
  color: var(--muted);
  white-space: nowrap;
}

/* Appareil */
.history-device-cell {
  font-size: var(--fs-sm);
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Lieu & Débit */
.history-location-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.history-bitrate,
.history-location {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-xs);
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-meta-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.75;
}
</style>
