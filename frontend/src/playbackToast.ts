import { episodeLabel, type EpisodeLike } from '@/utils/episode';

/** « Série · S1 · É11 · Épisode » : le numéro d'épisode situe la lecture d'un coup d'œil. */
export function playbackTitle(item: { grandparent_title?: string; title?: string } & EpisodeLike = {}): string {
  if (!item.grandparent_title) return item.title || 'Lecture Plex';
  const number = item.season_number != null || item.episode_number != null ? episodeLabel(item) : '';
  return [item.grandparent_title, number, item.title || 'Lecture Plex'].filter(Boolean).join(' · ');
}

export function playbackStartsFromEvent(event: any): any[] {
  const started = event?.detail?.payload?.started;
  return Array.isArray(started) ? started : [];
}
