import { describe, expect, it } from 'vitest';
import { logsToCsv } from './logsCsv';

describe('logsToCsv', () => {
  it('écrit un CSV lisible par Excel en français', () => {
    const csv = logsToCsv([{ date: '08/10 22:41', source: 'Arr', title: 'Radarr a refusé « Dune »', detail: 'déjà présent; 400', result: 'Échec' }]);
    expect(csv.startsWith('﻿Date;Source;Titre;Détail;Résultat')).toBe(true);
    // Un « ; » dans une cellule la fait passer entre guillemets.
    expect(csv).toContain('"déjà présent; 400"');
  });
});
