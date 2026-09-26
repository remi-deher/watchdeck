<template>
  <section class="panel history-panel">
    <UiSectionHeader eyebrow="Historique" title="Dernières lectures">
      <template #meta><small>{{ countLabel }}</small></template>
      <template #actions>
        <UiButton variant="ghost" :disabled="!rows.length" title="Exporter en CSV" @click="exportCsv"><template #icon><FileDown /></template>CSV</UiButton>
      </template>
    </UiSectionHeader>
    <!-- Chaque colonne se trie d'un clic, comme l'inventaire des Insights ; un second clic
         inverse le sens. Le tri est fait par le serveur, sur toute la periode. -->
    <div class="history-sort" role="toolbar" aria-label="Trier l’historique">
      <span class="history-sort__spacer" aria-hidden="true"></span>
      <span class="history-sort__cell">
        <button v-for="column in ['title', 'user']" :key="column" type="button" class="history-sort__button" :class="{ active: sortColumn === column }" :aria-pressed="sortColumn === column" :aria-label="sortLabel(column)" @click="toggleSort(column)">
          {{ SORT_COLUMNS[column] }}<component :is="sortIcon(column)" v-if="sortColumn === column" aria-hidden="true" />
        </button>
      </span>
      <span v-for="column in ['device', 'method', 'duration', 'date']" :key="column" class="history-sort__cell">
        <button type="button" class="history-sort__button" :class="{ active: sortColumn === column }" :aria-pressed="sortColumn === column" :aria-label="sortLabel(column)" @click="toggleSort(column)">
          {{ SORT_COLUMNS[column] }}<component :is="sortIcon(column)" v-if="sortColumn === column" aria-hidden="true" />
        </button>
      </span>
    </div>
    <div class="history-table">
      <!-- Un marathon produisait autant de lignes identiques que d’episodes. Les lectures
           consecutives d’un meme media par la meme personne sont donc repliees en une
           ligne, qui porte leur nombre et leur duree cumulee.
           Les lignes sont ensuite reunies par journee : un historique se lit par date,
           et l'en-tete collant garde la date sous les yeux pendant le defilement. -->
      <template v-for="day in days" :key="day.key">
        <h3 v-if="groupByDay" class="history-day">
          <span>{{ day.label }}</span>
          <small>{{ day.count }} lecture{{ day.count > 1 ? 's' : '' }} · {{ formatDuration(day.watchedMs) }}</small>
        </h3>
        <button v-for="row in day.rows" :key="row.key" @click="$emit('select', row.item)">
        <MediaArtwork :src="row.item.thumb_url" :alt="displayTitle(row.item)" :type="row.item.media_type" size="history"/>
        <span class="history-title">
          <strong>{{ displayTitle(row.item) }}<em v-if="row.count > 1" class="history-group">&times;{{ row.count }}</em></strong>
          <small>{{ row.item.user_name || 'Utilisateur Plex' }}<template v-if="row.count > 1"> &middot; {{ row.count }} lectures consécutives</template></small>
        </span>
        <span class="history-client">
          <span><Monitor/><strong>{{ deviceLabel(row.item) }}</strong></span>
          <span><Network/><code>{{ addressLabel(row.item) }}</code></span>
          <span class="history-place"><MapPin/><span>{{ locationLabel(row.item) }}</span></span>
        </span>
        <PlaybackMethodBadge :method="row.item.playback_method"/>
        <span class="history-duration">{{ formatDuration(row.watchedMs) }}</span>
        <time>{{ formatDate(row.item.started_at) }}</time>
        </button>
      </template>
      <p v-if="!rows.length" class="empty">Aucune lecture ne correspond aux filtres.</p>
    </div>

    <!-- La suite se charge en approchant du bas plutot qu'au clic. Le bouton reste
         rendu : il sert de repli quand l'observateur n'existe pas, et de commande
         atteignable au clavier -- on ne peut pas « faire defiler » avec Tab. -->
    <div ref="sentinel" class="history-sentinel" aria-hidden="true"></div>
    <UiButton v-if="hasMore" class="history-more" :loading="loadingMore" @click="$emit('load-more')">
      {{ loadingMore ? 'Chargement…' : `Afficher ${pageSize} lectures de plus` }}
    </UiButton>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useIntersectionObserver } from '@vueuse/core';
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { downloadTextFile } from '@/utils/download';
import { ArrowDown, ArrowUp, FileDown, MapPin, Monitor, Network } from '@lucide/vue';
import { formatDurationExact as formatDuration, formatDateTimeShort, formatLongDay } from '@/utils/format';
import { isToday, isYesterday } from 'date-fns';
import { localIso } from '@/utils/timeBuckets';
import MediaArtwork from './MediaArtwork.vue';
import PlaybackMethodBadge from './PlaybackMethodBadge.vue';

export interface HistoryItem {
  id?: number | string;
  source?: string;
  session_id?: string | number;
  thumb_url?: string;
  media_type?: string;
  title?: string;
  grandparent_title?: string;
  user_name?: string;
  player?: string;
  product?: string;
  platform?: string;
  address?: string;
  geo_status?: string;
  geo_city?: string;
  geo_region?: string;
  geo_country?: string;
  geo_country_code?: string;
  playback_method?: string;
  watched_ms?: number;
  started_at?: string;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    items?: HistoryItem[];
    total?: number;
    hasMore?: boolean;
    loadingMore?: boolean;
    pageSize?: number;
    sort?: string;
    grouped?: boolean;
    /** Regroupement par journee. Le tri « Duree » melange les dates : l'en-tete de jour
     *  n'y voudrait plus rien dire, la vue reste alors a plat. */
    groupByDay?: boolean;
  }>(),
  {
    items: () => [],
    total: 0,
    hasMore: false,
    loadingMore: false,
    pageSize: 100,
    sort: 'recent',
    grouped: true,
    groupByDay: true,
  }
);

const emit = defineEmits<{
  (e: 'select', item: HistoryItem): void;
  (e: 'load-more'): void;
  (e: 'update:sort', value: string): void;
}>();

/* Tri : `<colonne>_<asc|desc>`, tel que l'attend l'API. Les anciennes valeurs
   (`recent`, `oldest`, `longest`) sont encore comprises. */
const SORT_COLUMNS: Record<string, string> = {
  title: 'Titre', user: 'Utilisateur', device: 'Appareil', method: 'Lecture', duration: 'Durée', date: 'Date',
};
const ALIASES: Record<string, string> = { recent: 'date_desc', oldest: 'date_asc', longest: 'duration_desc' };
const parsedSort = computed(() => {
  const value = ALIASES[props.sort] || props.sort || 'date_desc';
  const cut = value.lastIndexOf('_');
  return { column: value.slice(0, cut), direction: value.slice(cut + 1) };
});
const sortColumn = computed(() => parsedSort.value.column);
// Premier clic : les dates et durees commencent par les plus grandes, le texte par A.
const FIRST_DIRECTION: Record<string, string> = { date: 'desc', duration: 'desc' };
function toggleSort(column: string): void {
  const direction = sortColumn.value === column
    ? (parsedSort.value.direction === 'asc' ? 'desc' : 'asc')
    : (FIRST_DIRECTION[column] || 'asc');
  emit('update:sort', `${column}_${direction}`);
}
function sortIcon(column: string) {
  return sortColumn.value === column && parsedSort.value.direction === 'asc' ? ArrowUp : ArrowDown;
}
function sortLabel(column: string): string {
  const current = sortColumn.value === column ? (parsedSort.value.direction === 'asc' ? ', croissant' : ', décroissant') : '';
  return `Trier par ${SORT_COLUMNS[column].toLowerCase()}${current}`;
}

interface HistoryRow { key: string; item: HistoryItem; count: number; watchedMs: number }

/* Le repliement ne porte que sur des lectures *consecutives* : c'est ce qui fait le mur
   de lignes identiques d'un marathon. Deux visionnages separes dans le temps restent
   deux lignes, parce que ce sont deux evenements distincts. */
const rows = computed<HistoryRow[]>(() => {
  const source = props.items || [];
  if (!props.grouped) {
    return source.map((item) => ({
      key: rowKey(item),
      item,
      count: 1,
      watchedMs: item.watched_ms || 0,
    }));
  }
  const out: HistoryRow[] = [];
  for (const item of source) {
    const previous = out[out.length - 1];
    const sameRun =
      previous &&
      previous.item.user_name === item.user_name &&
      groupKey(previous.item) === groupKey(item) &&
      deviceLabel(previous.item) === deviceLabel(item);
    if (sameRun) {
      previous.count += 1;
      previous.watchedMs += item.watched_ms || 0;
      continue;
    }
    out.push({ key: rowKey(item), item, count: 1, watchedMs: item.watched_ms || 0 });
  }
  return out;
});

/* Les lignes deja repliees, reunies par jour de debut de lecture. */
const days = computed(() => {
  if (!props.groupByDay) return [{ key: 'all', label: '', count: rows.value.length, watchedMs: 0, rows: rows.value }];
  const out: { key: string; label: string; count: number; watchedMs: number; rows: HistoryRow[] }[] = [];
  for (const row of rows.value) {
    const key = String(row.item.started_at || '').slice(0, 10) || 'sans-date';
    const last = out[out.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
      last.count += row.count;
      last.watchedMs += row.watchedMs;
      continue;
    }
    out.push({ key, label: dayLabel(key), count: row.count, watchedMs: row.watchedMs, rows: [row] });
  }
  return out;
});

function dayLabel(key: string): string {
  if (key === 'sans-date') return 'Date inconnue';
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  if (isToday(date)) return "Aujourd’hui";
  if (isYesterday(date)) return 'Hier';
  return formatLongDay(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* Chargement au defilement : une sentinelle sous la liste declenche la page suivante des
   qu'elle approche du bas. Le clic sur « Afficher 100 de plus » restait le seul moyen de
   descendre dans un historique de plusieurs milliers de lignes. */
const sentinel = ref<HTMLElement | null>(null);
useIntersectionObserver(
  () => (props.hasMore ? sentinel.value : null),
  (entries) => {
    // `loadingMore` est relu ici et non capture : une page peut arriver pendant que
    // la sentinelle est encore visible, et redemander la meme page la dupliquerait.
    if (entries.some((entry) => entry.isIntersecting) && props.hasMore && !props.loadingMore) {
      emit('load-more');
    }
  },
  { rootMargin: '400px' }
);

const countLabel = computed(() => {
  const shown = (props.items || []).length;
  const total = props.total || shown;
  const suffix = total > 1 ? 's' : '';
  return shown < total ? `${shown} sur ${total} lecture${suffix}` : `${total} lecture${suffix}`;
});

/* Plex reutilise `session_id` d'une lecture a l'autre : la cle de la ligne en base est
   la seule identite fiable, et deux cles de liste identiques cassent le rendu Vue. */
function rowKey(item: HistoryItem): string {
  return item.id != null ? `row:${item.id}` : `${item.source}:${item.session_id}`;
}

function groupKey(item: HistoryItem): string {
  return item.grandparent_title || item.title || '';
}

function exportCsv(): void {
  const header = ['Titre', 'Utilisateur', 'Appareil', 'Adresse', 'Lieu', 'Lecture', 'Durée (s)', 'Début'];
  const lines = [header, ...rows.value.map((row) => [
    displayTitle(row.item),
    row.item.user_name || '',
    deviceLabel(row.item),
    row.item.address || '',
    locationLabel(row.item),
    row.item.playback_method || '',
    String(Math.round((row.watchedMs || 0) / 1000)),
    row.item.started_at || '',
  ])];
  const csv = lines.map((line) => line.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  // BOM : sans lui Excel lit le CSV en ANSI et casse tous les accents.
  downloadTextFile(
    `historique-lectures-${localIso(new Date())}.csv`,
    '﻿' + csv,
    'text/csv;charset=utf-8'
  );
}

function displayTitle(item: HistoryItem): string {
  return item.grandparent_title ? `${item.grandparent_title} · ${item.title}` : item.title || '';
}
function deviceLabel(item: HistoryItem): string {
  return item.player || item.product || item.platform || 'Appareil inconnu';
}
function addressLabel(item: HistoryItem): string {
  return item.address || 'IP indisponible';
}
function locationLabel(item: HistoryItem): string {
  if (item.geo_status === 'local') return 'local';
  if (item.geo_status === 'anonymized') return 'Lieu masqué';
  return [item.geo_city, item.geo_region, item.geo_country_code || item.geo_country].filter(Boolean).join(', ') || 'Lieu indisponible';
}
const formatDate = (value: any) => formatDateTimeShort(value, '—');
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.panel-head>small{color:var(--muted);font-size:var(--fs-sm)}.history-table{display:grid;margin-top:12px}.history-day{position:sticky;top:0;z-index:1;display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);margin:0;padding:8px 12px;background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--border);color:var(--text);font-size:var(--fs-sm);text-transform:capitalize}.history-day small{color:var(--muted);font-size:var(--fs-xs);text-transform:none;white-space:nowrap}.history-sentinel{height:1px}.history-table button{display:grid;grid-template-columns:64px minmax(210px,1fr) minmax(190px,250px) 112px 84px 145px;gap: var(--space-4);align-items:center;width:100%;min-height:112px;padding:10px 12px;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text);text-align:left}.history-table button:hover{background:rgb(var(--ink) / .045)}.history-title{display:grid;gap: var(--space-2);min-width:0}.history-title strong,.history-title small,.history-client strong,.history-client code,.history-place span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-title strong{font-size:var(--fs-base);line-height:1.4}.history-title small{color:color-mix(in srgb,var(--text) 76%,transparent);font-size:var(--fs-sm)}.history-client{display:grid;gap: var(--space-2);min-width:0}.history-client>span{display:flex;align-items:center;gap: var(--space-2);min-width:0;color:color-mix(in srgb,var(--text) 80%,transparent);font-size:var(--fs-sm);line-height:1.3}.history-client svg{flex:none;width:16px;height:16px;color:var(--muted)}.history-client code{font-family:inherit;font-size:var(--fs-sm);font-variant-numeric:tabular-nums}.history-place span{font-weight:600}.history-table time{color:color-mix(in srgb,var(--text) 72%,transparent);font-size:var(--fs-sm);line-height:1.4}.history-duration{font-size:var(--fs-md);font-weight:700;white-space:nowrap}.history-group{margin-left:7px;padding:1px 6px;border-radius:var(--radius-pill);background:color-mix(in srgb,var(--accent) 22%,transparent);color:var(--accent);font-size:var(--fs-xs);font-style:normal;font-weight:700}.history-more{margin-top:12px}
.history-sort{display:grid;grid-template-columns:64px minmax(210px,1fr) minmax(190px,250px) 112px 84px 145px;gap:var(--space-4);align-items:center;margin-top:12px;padding:6px 12px;border-bottom:1px solid var(--border)}
.history-sort__cell{display:flex;flex-wrap:wrap;gap:var(--space-2);min-width:0}
.history-sort__button{display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:2px 6px;margin-left:-6px;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--muted);font:inherit;font-size:var(--fs-xs);font-weight:700;letter-spacing:.02em;text-transform:uppercase;cursor:pointer}
.history-sort__button:hover{color:var(--text);background:var(--surface-2)}
.history-sort__button.active{color:var(--accent)}
.history-sort__button svg{width:13px;height:13px}
.history-sort__button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
@media(max-width:1150px){.history-sort{grid-template-columns:64px minmax(190px,1fr) minmax(180px,230px) 112px 80px}.history-sort__cell:last-child{grid-column:2/4;grid-row:2}}
/* Sur telephone les lignes ne sont plus alignees en colonnes : les tris forment une
   rangee de boutons. */
@include bp.until(tablet) {.history-sort{display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-3);padding:6px 6px}.history-sort__spacer{display:none}.history-sort__cell{display:contents}.history-sort__button{margin-left:0;min-height:36px}}@media(max-width:1150px){.history-table button{grid-template-columns:64px minmax(190px,1fr) minmax(180px,230px) 112px 80px}.history-table time{grid-column:2/4;font-size:var(--fs-xs)}.history-duration{grid-column:5;grid-row:1/3}}@include bp.until(tablet) {.history-table button{grid-template-columns:64px minmax(0,1fr) auto;gap:var(--space-3) var(--space-4);align-items:start}.history-client{grid-column:2}.history-duration{grid-column:2;grid-row:auto;font-size:var(--fs-sm)}.history-table time{grid-column:3;grid-row:2;font-size:var(--fs-xs)}.history-table :deep(.playback-badge){grid-column:3;grid-row:1}}@media(max-width:480px){.history-table button{grid-template-columns:58px minmax(0,1fr) auto;padding-inline:6px}.history-table time{display:none}.history-title strong{font-size:var(--fs-md)}.history-title small,.history-client>span,.history-client code{font-size:var(--fs-xs)}}
</style>
