import { describe, expect, it } from 'vitest';

import { isPublished, isRejected, releaseComparison, technicalSummary } from './releaseComparison';

describe('releaseComparison', () => {
  it('écarte un torrent sans source et repère une release rejetée', () => {
    expect(isPublished({ protocol: 'torrent', seeders: 0 })).toBe(false);
    expect(isPublished({ protocol: 'usenet' })).toBe(true);
    expect(isRejected({ rejections: ['Unknown'] })).toBe(true);
    expect(isRejected({})).toBe(false);
  });

  it('préfère le comparatif du serveur, qui fait autorité', () => {
    const release = {
      title: 'Film.2020.1080p.WEB-DL',
      vf_technical: { current: { resolution: 2160, dynamic_range: ['dv'] }, candidate: { resolution: 1080, quality: 'WEB-DL' } },
      vf_technical_reasons: ['Résolution inférieure'],
    };
    const comparison = releaseComparison(release, ['Film.2020.2160p.DV']);
    expect(comparison.warnings).toEqual(['Résolution inférieure']);
    expect(technicalSummary(comparison.current)).toBe('2160p · Dolby Vision');
    expect(technicalSummary(comparison.candidate)).toBe('1080p · WEB-DL');
  });

  it('retombe sur la lecture des titres sans annotation du serveur', () => {
    const comparison = releaseComparison({ title: 'Film.2020.720p.WEB-DL' }, []);
    expect(Array.isArray(comparison.warnings)).toBe(true);
    expect(technicalSummary({})).toBe('Marqueurs inconnus');
  });
});
