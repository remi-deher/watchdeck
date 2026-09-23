import { describe, expect, it } from 'vitest';

import { buildMonthGrid, bucketStart, localIso, monthBounds, monthLabel } from './timeBuckets';

describe('helpers calendaires', () => {

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

describe('buildMonthGrid', () => {
  const dates = (month) => buildMonthGrid(month).map(day => day.date);

  it('part toujours du lundi de la semaine du 1er et rend six semaines', () => {
    // Septembre 2026 commence un mardi : la grille ouvre sur le lundi 31 août.
    const grid = buildMonthGrid(new Date(2026, 8, 15));
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ date: '2026-08-31', day: 31, current: false });
    expect(grid.at(-1).date).toBe('2026-10-11');
    expect(grid.filter(day => day.current)).toHaveLength(30);
  });

  it('gère un mois commençant un dimanche sans décaler la première semaine', () => {
    // Novembre 2026 commence un dimanche : il occupe la dernière case de la semaine 1.
    const grid = buildMonthGrid(new Date(2026, 10, 12));
    expect(grid[0].date).toBe('2026-10-26');
    expect(grid[6]).toEqual({ date: '2026-11-01', day: 1, current: true });
  });

  it('couvre février bissextile en entier', () => {
    const grid = buildMonthGrid(new Date(2028, 1, 10));
    const current = grid.filter(day => day.current);
    expect(current).toHaveLength(29);
    expect(current.at(-1).date).toBe('2028-02-29');
  });

  it("ne saute ni ne double un jour au changement d'heure de printemps", () => {
    // Nuit du 28 au 29 mars 2026 : 2 h devient 3 h. Un calcul en « +24 h » ou une date
    // construite heure par heure retombait le 28 au soir, donnant deux fois la même clé.
    const march = dates(new Date(2026, 2, 15));
    expect(march).toContain('2026-03-29');
    expect(march.filter(date => date === '2026-03-28')).toHaveLength(1);
    expect(new Set(march).size).toBe(42);
  });

  it("ne saute ni ne double un jour au changement d'heure d'automne", () => {
    // Nuit du 24 au 25 octobre 2026 : 3 h redevient 2 h, la journée dure vingt-cinq heures.
    const october = dates(new Date(2026, 9, 15));
    expect(october).toContain('2026-10-25');
    expect(new Set(october).size).toBe(42);
  });

  it('numérote les jours de débord avec leur propre quantième', () => {
    const grid = buildMonthGrid(new Date(2026, 8, 15));
    expect(grid.find(day => day.date === '2026-10-01')).toEqual({ date: '2026-10-01', day: 1, current: false });
  });
});
