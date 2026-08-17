interface ResolutionConfig {
  pattern: RegExp;
  label: string;
  rank: number;
}

const RESOLUTIONS: ResolutionConfig[] = [
  { pattern: /(?:^|\W)(2160p|4k)(?:\W|$)/i, label: '2160p', rank: 4 },
  { pattern: /(?:^|\W)1080[pi](?:\W|$)/i, label: '1080p', rank: 3 },
  { pattern: /(?:^|\W)720p(?:\W|$)/i, label: '720p', rank: 2 },
  { pattern: /(?:^|\W)(?:576|480)[pi](?:\W|$)/i, label: 'SD', rank: 1 },
];

export interface ParsedEpisodeInfo {
  isSeries: boolean;
  seasons: number[];
  episodes: number[];
  isSeasonPack: boolean;
}

export function parseReleaseEpisodeInfo(title = ''): ParsedEpisodeInfo {
  const seasons = new Set<number>();
  const episodes = new Set<number>();
  let isSeries = false;
  let isSeasonPack = false;

  const sMatch = title.match(/\bS(\d{1,3})(?:[ ._-]*E(\d{1,4}))?\b/i);
  const xMatch = title.match(/\b(\d{1,2})x(\d{1,4})\b/i);
  const seasonPackMatch = title.match(/\b(?:S|Season|Saison)[ ._-]*(\d{1,3})\b/i);

  if (sMatch) {
    isSeries = true;
    seasons.add(parseInt(sMatch[1], 10));
    if (sMatch[2]) episodes.add(parseInt(sMatch[2], 10));
    else isSeasonPack = true;
  } else if (xMatch) {
    isSeries = true;
    seasons.add(parseInt(xMatch[1], 10));
    episodes.add(parseInt(xMatch[2], 10));
  } else if (seasonPackMatch) {
    isSeries = true;
    seasons.add(parseInt(seasonPackMatch[1], 10));
    isSeasonPack = true;
  }

  return {
    isSeries,
    seasons: Array.from(seasons),
    episodes: Array.from(episodes),
    isSeasonPack,
  };
}

export interface ParsedReleaseTitle {
  resolution: string | null;
  resolutionRank: number;
  dolbyVision: boolean;
  hdr: boolean;
  codec: string | null;
  source: string | null;
  french: string | null;
  episodeInfo: ParsedEpisodeInfo;
}

export function parseReleaseTitle(title = ''): ParsedReleaseTitle {
  const resolution = RESOLUTIONS.find((entry) => entry.pattern.test(title));
  const dolbyVision = /(?:dolby[ ._-]?vision|\bDOVI\b|\bDV\b)/i.test(title);
  const hdr = dolbyVision || /(?:\bHDR(?:10\+?)?\b|\bHLG\b)/i.test(title);
  const codec = /(?:\bx265\b|\bHEVC\b)/i.test(title)
    ? 'HEVC/x265'
    : /(?:\bx264\b|\bAVC\b)/i.test(title) ? 'AVC/x264' : null;
  const source = /\bREMUX\b/i.test(title) ? 'REMUX'
    : /\bWEB[ ._-]?DL\b/i.test(title) ? 'WEB-DL'
      : /\bWEB[ ._-]?RIP\b/i.test(title) ? 'WEBRip'
        : /\b(?:BLU[ ._-]?RAY|BDRIP)\b/i.test(title) ? 'Blu-ray' : null;
  const french = /\bTRUEFRENCH\b/i.test(title) ? 'TRUEFRENCH'
    : /(?:^|\W)VFF(?:2)?(?:\W|$)/i.test(title) ? 'VFF'
      : /(?:^|\W)VFI(?:\W|$)/i.test(title) ? 'VFI'
        : /(?:^|\W)MULTI(?:\W|$)/i.test(title) ? 'MULTI'
          : /(?:^|\W)FRENCH(?:\W|$)/i.test(title) ? 'FRENCH' : null;
  const episodeInfo = parseReleaseEpisodeInfo(title);
  return {
    resolution: resolution?.label || null,
    resolutionRank: resolution?.rank || 0,
    dolbyVision,
    hdr,
    codec,
    source,
    french,
    episodeInfo,
  };
}

export interface ReleaseTitlesSummary {
  resolution: string | null;
  resolutionRank: number;
  dolbyVision: boolean;
  hdr: boolean;
  codecs: string[];
  sources: string[];
}

export function summarizeReleaseTitles(titles: string[] = []): ReleaseTitlesSummary {
  const parsed = titles.map((t) => parseReleaseTitle(t));
  const best = parsed.reduce((current, item) => (
    item.resolutionRank > current.resolutionRank ? item : current
  ), { resolution: null, resolutionRank: 0 } as ParsedReleaseTitle);
  return {
    resolution: best.resolution,
    resolutionRank: best.resolutionRank,
    dolbyVision: parsed.some((item) => item.dolbyVision),
    hdr: parsed.some((item) => item.hdr),
    codecs: [...new Set(parsed.map((item) => item.codec).filter((c): c is string => Boolean(c)))],
    sources: [...new Set(parsed.map((item) => item.source).filter((s): s is string => Boolean(s)))],
  };
}

export function compareReleaseTitles(currentTitles: string[] = [], candidateTitle = ''): {
  current: ReleaseTitlesSummary;
  candidate: ParsedReleaseTitle;
  warnings: string[];
} {
  const current = summarizeReleaseTitles(currentTitles);
  const candidate = parseReleaseTitle(candidateTitle);
  const warnings: string[] = [];
  if (current.resolutionRank && candidate.resolutionRank < current.resolutionRank) {
    warnings.push(`Résolution inférieure (${current.resolution} → ${candidate.resolution || 'inconnue'})`);
  }
  if (current.dolbyVision && !candidate.dolbyVision) warnings.push('Dolby Vision absent de la candidate');
  else if (current.hdr && !candidate.hdr) warnings.push('HDR absent de la candidate');
  return { current, candidate, warnings };
}

const REJECTION_TRANSLATIONS: [RegExp, string][] = [
  [/equal or higher preference/i, 'Le fichier actuel est de qualité égale ou supérieure'],
  [/quality.*not wanted/i, 'Qualité non autorisée par le profil'],
  [/not an upgrade/i, 'Cette release n’est pas considérée comme une amélioration'],
  [/custom format/i, 'Score ou format personnalisé non conforme'],
  [/size/i, 'Taille hors des limites configurées'],
  [/already.*download/i, 'Release déjà téléchargée'],
  [/seeders/i, 'Nombre de seeders insuffisant'],
  [/language/i, 'Langue non conforme au profil'],
];

export function translateRejection(reason = ''): string {
  return REJECTION_TRANSLATIONS.find(([pattern]) => pattern.test(reason))?.[1] || reason;
}

export function releaseDecisionScore(release: {
  rejected?: boolean;
  rejections?: string[];
  vf_preference_rank?: number | null;
  vf_confidence?: number | null;
  custom_format_score?: number | null;
  seeders?: number | null;
}): number {
  const rejectedPenalty = release.rejected || release.rejections?.length ? 1_000_000 : 0;
  const preferencePenalty = (release.vf_preference_rank ?? 99) * 10_000;
  const confidenceBonus = (release.vf_confidence || 0) * 100;
  const customFormatBonus = release.custom_format_score || 0;
  const seedersBonus = Math.min(release.seeders || 0, 500);
  return rejectedPenalty + preferencePenalty - confidenceBonus - customFormatBonus - seedersBonus;
}
