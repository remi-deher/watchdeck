import { describe, expect, it } from 'vitest';

import {
  compareReleaseTitles,
  parseReleaseEpisodeInfo,
  parseReleaseTitle,
  releaseDecisionScore,
  translateRejection,
} from './releaseTitle';

describe('release title analysis', () => {
  it('detects technical and French markers from the title', () => {
    expect(parseReleaseTitle('Movie.TRUEFRENCH.2160p.WEB-DL.DV.HDR.x265')).toMatchObject({
      resolution: '2160p', dolbyVision: true, hdr: true, codec: 'HEVC/x265',
      source: 'WEB-DL', french: 'TRUEFRENCH',
    });
  });

  it('parses season and episode info from title', () => {
    expect(parseReleaseEpisodeInfo('Show.S01E03.1080p.MULTI')).toEqual({
      isSeries: true,
      seasons: [1],
      episodes: [3],
      isSeasonPack: false,
    });

    expect(parseReleaseEpisodeInfo('Show.S02.Pack.MULTI')).toEqual({
      isSeries: true,
      seasons: [2],
      episodes: [],
      isSeasonPack: true,
    });
  });

  it('warns when a candidate title loses resolution and HDR', () => {
    const comparison = compareReleaseTitles(
      ['Show.S01E01.2160p.WEB-DL.HDR.x265'],
      'Show.S01.MULTI.1080p.WEB-DL.x264',
    );
    expect(comparison.warnings).toEqual([
      'Résolution inférieure (2160p → 1080p)',
      'HDR absent de la candidate',
    ]);
  });

  it('ranks an accepted preferred release before a rejected one', () => {
    const accepted = { vf_preference_rank: 0, vf_confidence: 90, seeders: 5 };
    const rejected = { vf_preference_rank: 0, vf_confidence: 100, seeders: 500, rejected: true };
    expect(releaseDecisionScore(accepted)).toBeLessThan(releaseDecisionScore(rejected));
  });

  it('translates known arr rejection reasons', () => {
    expect(translateRejection('Quality for existing file on disk is of equal or higher preference'))
      .toBe('Le fichier actuel est de qualité égale ou supérieure');
  });
});
