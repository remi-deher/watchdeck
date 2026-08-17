/** Filtres d'épisode réutilisables, opérant sur la forme fusionnée produite par
 * useSeasonEpisodes (status VF/VO + statut des sous-titres FR/forcés). Le composant
 * SeasonEpisodeList ne connaît pas ce vocabulaire : c'est au code appelant de choisir
 * le filtre pertinent selon le contexte (fiche média, alignement Plex, ...).
 */
export interface EpisodeLike {
  status?: string;
  isKnownEpisode?: boolean;
  has_full_fr_sub?: boolean | null;
  full_fr_sub_is_default?: boolean | null;
  has_forced_fr_sub?: boolean | null;
  forced_fr_sub_is_default?: boolean | null;
}

function isFrancophone(ep: EpisodeLike): boolean {
  return ep.status === 'vf' || ep.status === 'vf_secondary';
}

export const episodeFilters = {
  all: (): boolean => true,

  onlyFr: (ep: EpisodeLike): boolean => isFrancophone(ep),
  noFrAudio: (ep: EpisodeLike): boolean => ep.status === 'vo',

  /** Audio FR présent mais pas la piste principale (à réaligner). */
  frAudioSecondary: (ep: EpisodeLike): boolean => ep.status === 'vf_secondary',

  /** Épisode non-francophone sans sous-titre FR complet. */
  subFrMissing: (ep: EpisodeLike): boolean => ep.status === 'vo' && !ep.has_full_fr_sub,

  /** Sous-titre FR complet présent mais pas activé par défaut. */
  subFrNotDefault: (ep: EpisodeLike): boolean =>
    ep.status === 'vo' && Boolean(ep.has_full_fr_sub) && !ep.full_fr_sub_is_default,

  /** Sous-titre forcé FR présent mais pas activé par défaut (média francophone). */
  forcedSubNotDefault: (ep: EpisodeLike): boolean =>
    isFrancophone(ep) && Boolean(ep.has_forced_fr_sub) && !ep.forced_fr_sub_is_default,

  /** Regroupe tout ce qu'un alignement Plex (PASTA) peut corriger. */
  needsAlignment: (ep: EpisodeLike): boolean =>
    ep.isKnownEpisode !== false &&
    (episodeFilters.frAudioSecondary(ep) ||
      episodeFilters.subFrNotDefault(ep) ||
      episodeFilters.forcedSubNotDefault(ep)),
};
