/* Pistes d'un fichier (audio, sous-titres) et statut VF d'un episode : ce que la fiche
   affiche dans sa section audio, calcule ici pour rester testable hors composant. */

export interface SubtitleAlertsResult {
  subFrNoTrack: boolean;
  subFrAbsent: boolean;
  subFrNotDefault: boolean;
  forcedFrNotDefault: boolean;
}

export type SubtitleAlertKey = keyof SubtitleAlertsResult;
/** Alertes d'un fichier (vrai / faux) ou d'une saison (nombre d'episodes concernes). */
export type SubtitleAlertValues = Partial<Record<SubtitleAlertKey, boolean | number | null | undefined>>;
export type SubtitleAlertContext = 'movie' | 'episode' | 'season';

/** Alertes de sous-titres d'un fichier, selon qu'il est francophone ou non. */
export function subtitleAlerts(tracks: any[] = [], subtitles: any[] = []): SubtitleAlertsResult {
  const isFrancophone = tracks.some((t) => t.is_fr);
  const fullFrSubs = subtitles.filter((s) => s.is_fr && !s.is_forced);
  const forcedFrSubs = subtitles.filter((s) => s.is_fr && s.is_forced);

  if (!isFrancophone) {
    const hasAnyTrack = subtitles.length > 0;
    const hasFullFr = fullFrSubs.length > 0;
    const fullFrIsDefault = fullFrSubs.some((s) => s.is_default);
    return {
      subFrNoTrack: !hasAnyTrack,
      subFrAbsent: hasAnyTrack && !hasFullFr,
      subFrNotDefault: hasFullFr && !fullFrIsDefault,
      forcedFrNotDefault: false,
    };
  }
  return {
    subFrNoTrack: false,
    subFrAbsent: false,
    subFrNotDefault: false,
    forcedFrNotDefault: forcedFrSubs.length > 0 && !forcedFrSubs.some((s) => s.is_default),
  };
}

export function hasSubtitleAlert(alerts: SubtitleAlertValues): boolean {
  return Object.values(alerts).some(Boolean);
}

/** Les compteurs d'une saison, sous les memes cles que les alertes d'un fichier. */
export function seasonSubtitleAlerts(counts: Record<string, number> | null | undefined): SubtitleAlertValues {
  return {
    subFrNoTrack: counts?.sub_fr_no_track,
    subFrAbsent: counts?.sub_fr_absent,
    subFrNotDefault: counts?.sub_fr_not_default,
    forcedFrNotDefault: counts?.forced_fr_not_default,
  };
}

interface SubtitleAlertText {
  label: string;
  tooltip: string;
}

const INCRUSTES = 'les sous-titres sont probablement incrustés dans l’image.';

/** Pastille de chaque alerte (classe, style) et ses textes selon ce qu'elle qualifie ;
    en saison, le libelle precede le nombre d'episodes. */
export const SUBTITLE_ALERTS: Array<{
  key: SubtitleAlertKey;
  badgeClass: string;
  style?: string;
  text: Record<SubtitleAlertContext, SubtitleAlertText>;
}> = [
  {
    key: 'subFrNoTrack',
    badgeClass: '',
    style: 'background:var(--muted);color:var(--bg)',
    text: {
      movie: { label: 'Sous-titres incrustés', tooltip: `Aucune piste de sous-titre détectée : ${INCRUSTES}` },
      episode: { label: 'Sous-titres incrustés', tooltip: `Aucune piste de sous-titre détectée : ${INCRUSTES}` },
      season: { label: 'Sous-titres incrustés :', tooltip: `Épisodes sans aucune piste de sous-titre : ${INCRUSTES}` },
    },
  },
  {
    key: 'subFrAbsent',
    badgeClass: 'danger',
    text: {
      movie: { label: 'Sous-titre FR absent', tooltip: "Ce film non-francophone n'a pas de sous-titre français complet" },
      episode: { label: 'Sous-titre FR absent', tooltip: 'Pas de sous-titre français complet pour cet épisode non-francophone' },
      season: { label: 'Sub FR absent:', tooltip: 'Épisodes non-francophones sans sous-titre FR complet' },
    },
  },
  {
    key: 'subFrNotDefault',
    badgeClass: 'pending',
    text: {
      movie: { label: 'Sous-titre FR non activé', tooltip: 'Un sous-titre français complet est présent mais non activé par défaut' },
      episode: { label: 'Sous-titre FR non activé', tooltip: 'Sous-titre FR complet présent mais non activé par défaut' },
      season: { label: 'Sub FR non activé:', tooltip: 'Épisodes avec sous-titre FR complet non activé par défaut' },
    },
  },
  {
    key: 'forcedFrNotDefault',
    badgeClass: 'language-tag vf-secondary',
    text: {
      movie: { label: 'Sous-titre forcé FR non activé', tooltip: 'Un sous-titre FR sign/traduction est présent mais non activé par défaut' },
      episode: { label: 'Forcé FR non activé', tooltip: 'Sous-titre FR sign/traduction présent mais non activé par défaut' },
      season: { label: 'Forcé FR non activé:', tooltip: 'Épisodes francophones avec sous-titre forcé FR (sign/trad) non activé par défaut' },
    },
  },
];

const EPISODE_STATUS_LABELS: Record<string, string> = { vf: 'VF', vf_secondary: 'VF (sec.)', vo: 'VO', absent: 'ABSENT', tba: 'TBA', unknown: '…' };
const EPISODE_STATUS_CLASSES: Record<string, string> = {
  vf: 'available',
  vf_secondary: 'language-tag vf-secondary',
  absent: 'danger',
  tba: 'pending_approval',
  unknown: 'pending',
};

export function episodeStatusLabel(status: string): string {
  return EPISODE_STATUS_LABELS[status] || status.toUpperCase();
}

export function episodeStatusClass(status: string): string {
  return EPISODE_STATUS_CLASSES[status] || '';
}

/** « Saison 2 — Le retour », sans repeter un nom qui n'est que « Saison 2 ». */
export function seasonHeading(season: { season_number: number; name?: string | null }): string {
  const named = season.name && !/^(saison|season)\s*\d+$/i.test(season.name);
  return `Saison ${season.season_number}${named ? ` — ${season.name}` : ''}`;
}
