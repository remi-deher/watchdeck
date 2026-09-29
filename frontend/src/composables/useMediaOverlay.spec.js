import { afterEach, describe, expect, it } from 'vitest';
import { etatDeSerie, etatDeSurfaceCourant, serieCourante } from './useMediaOverlay';

describe('série de lectures consécutives', () => {
  afterEach(() => history.replaceState(null, ''));

  it('se range dans l’état de l’entrée et survit au passage d’une lecture à l’autre', () => {
    const lectures = [
      { id: 10, method: 'transcode', started_at: '2026-08-03T20:00:00', watched_ms: 1, label: 'É1' },
      { id: '11', method: 'direct_play', started_at: '2026-08-03T21:00:00', watched_ms: 2, label: 'É2' },
    ];
    history.replaceState(etatDeSerie(lectures), '');
    expect(serieCourante().map((lecture) => lecture.id)).toEqual(['10', '11']);
    expect(Object.keys(etatDeSurfaceCourant())).toContain('__sheetRun');
  });

  it('est vide sans série dans l’entrée', () => {
    history.replaceState({ autre: 1 }, '');
    expect(serieCourante()).toEqual([]);
    history.replaceState({ __sheetRun: 'cassé' }, '');
    expect(serieCourante()).toEqual([]);
  });
});
