/* L'historique des lectures : repliement des reprises et export. Plex cree une nouvelle
   lecture a chaque arret puis reprise d'un meme media ; les lectures *consecutives* d'un
   meme film ou episode, par la meme personne sur le meme appareil, ne forment qu'une ligne,
   qui porte leur nombre et leur duree cumulee. */
import { plexClientName } from '@/utils/plexClient';
import { playbackTitle } from '@/playbackToast';
import { downloadTextFile } from '@/utils/download';
import { localIso } from '@/utils/timeBuckets';

export interface HistoryItem {
  id?: number | string;
  source?: string;
  session_id?: string | number;
  thumb_url?: string;
  media_type?: string;
  title?: string;
  grandparent_title?: string;
  season_number?: number | null;
  episode_number?: number | null;
  rating_key?: string | number;
  is_download?: boolean;
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

export interface PlaybackRun {
  key: string;
  /** La premiere lecture de la ligne. */
  item: HistoryItem;
  /** Toutes les lectures repliees, la premiere comprise. */
  items: HistoryItem[];
  count: number;
  watchedMs: number;
  method: string;
}

/* Plex reutilise `session_id` d'une lecture a l'autre : la cle de la ligne en base est
   la seule identite fiable, et deux cles de liste identiques cassent le rendu Vue. */
function playbackKey(item: HistoryItem): string {
  return item.id != null ? `row:${item.id}` : `${item.source}:${item.session_id}`;
}

/* Le media lui-meme, pas la serie : la cle Plex quand on l'a, sinon serie, saison,
   episode et titre (imports Tautulli anciens, sans cle). */
function mediaKey(item: HistoryItem): string {
  if (item.rating_key) return `media:${item.rating_key}`;
  return [item.grandparent_title, item.season_number, item.episode_number, item.title].map((part) => part ?? '').join('|');
}

/* Des lectures consecutives n'ont pas forcement le meme mode : un episode transcode, le
   suivant en lecture directe. La ligne le dit (« mixed ») au lieu de n'afficher que le
   mode de la premiere. */
function runMethod(items: HistoryItem[]): string {
  const methods = new Set(items.map((item) => item.playback_method || ''));
  return methods.size > 1 ? 'mixed' : items[0]?.playback_method || '';
}

function single(item: HistoryItem): PlaybackRun {
  return { key: playbackKey(item), item, items: [item], count: 1, watchedMs: item.watched_ms || 0, method: item.playback_method || '' };
}

/** Replie les reprises consecutives ; deux visionnages separes restent deux lignes. */
export function foldPlaybackRuns(source: HistoryItem[]): PlaybackRun[] {
  const out: PlaybackRun[] = [];
  for (const item of source) {
    const previous = out[out.length - 1];
    const sameRun = previous
      && previous.item.user_name === item.user_name
      && mediaKey(previous.item) === mediaKey(item)
      && plexClientName(previous.item) === plexClientName(item);
    if (sameRun) {
      previous.items.push(item);
      previous.count += 1;
      previous.watchedMs += item.watched_ms || 0;
      previous.method = runMethod(previous.items);
      continue;
    }
    out.push(single(item));
  }
  return out;
}

export function playbackDisplayTitle(item: HistoryItem): string {
  return item.grandparent_title || item.title ? playbackTitle(item) : '';
}

export function playbackLocation(item: HistoryItem): string {
  if (item.geo_status === 'local') return 'local';
  if (item.geo_status === 'anonymized') return 'Lieu masqué';
  return [item.geo_city, item.geo_region, item.geo_country_code || item.geo_country].filter(Boolean).join(', ') || 'Lieu indisponible';
}

/** Le CSV de l'historique affiche, une ligne par reprise repliee. */
export function historyCsv(runs: PlaybackRun[]): string {
  const header = ['Titre', 'Utilisateur', 'Appareil', 'Adresse', 'Lieu', 'Lecture', 'Durée (s)', 'Début'];
  const lines = [header, ...runs.map((run) => [
    playbackDisplayTitle(run.item),
    run.item.user_name || '',
    plexClientName(run.item),
    run.item.address || '',
    playbackLocation(run.item),
    run.method || '',
    String(Math.round((run.watchedMs || 0) / 1000)),
    run.item.started_at || '',
  ])];
  return lines.map((line) => line.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(';')).join('\r\n');
}

export function exportHistoryCsv(runs: PlaybackRun[]): void {
  // BOM : sans lui Excel lit le CSV en ANSI et casse tous les accents.
  downloadTextFile(`historique-lectures-${localIso(new Date())}.csv`, '﻿' + historyCsv(runs), 'text/csv;charset=utf-8');
}
