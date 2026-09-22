import { describe, expect, it } from 'vitest';

import { bucketStart, localIso, mondayDayIndex, monthBounds, monthLabel } from './timeBuckets';

describe('helpers calendaires', () => {
  it('conserve une date civile locale sans conversion UTC', () => {
    expect(localIso(new Date(2026, 8, 22, 23, 30))).toBe('2026-09-22');
  });

  it('indexe les jours à partir du lundi', () => {
    expect(mondayDayIndex(new Date(2026, 8, 21))).toBe(0);
    expect(mondayDayIndex(new Date(2026, 8, 27))).toBe(6);
  });

  it('calcule les bornes du mois sans dépendre du changement d’heure', () => {
    const march = monthBounds(new Date(2026, 2, 29, 12));
    expect(localIso(march.start)).toBe('2026-03-01');
    expect(localIso(march.end)).toBe('2026-04-01');
  });

  it('regroupe au lundi et au premier jour du mois', () => {
    expect(bucketStart('2026-09-27', 'week')).toBe('2026-09-21');
    expect(bucketStart('2026-09-27', 'month')).toBe('2026-09-01');
    expect(monthLabel('2026-09-01')).toBe('sept. 26');
  });
});
