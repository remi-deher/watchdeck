/* « S1 · É11 » plutot que « Saison 1 » : dans une serie, c'est l'episode qu'on cherche. */

export interface EpisodeLike {
  media_type?: string | null;
  parent_title?: string | null;
  season_number?: number | null;
  episode_number?: number | null;
}

/** Saison et episode d'une lecture ; a defaut de numeros, le libelle de saison de Plex. */
export function episodeLabel(item: EpisodeLike, fallback?: { season?: number | null; episode?: number | null }): string {
  const season = item.season_number ?? fallback?.season ?? null;
  const episode = item.episode_number ?? fallback?.episode ?? null;
  if (season != null && episode != null) return `S${season} · É${episode}`;
  if (episode != null) return `Épisode ${episode}`;
  return item.parent_title || '';
}
