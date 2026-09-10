/** La recherche des réglages : ce qu'elle retranche, et ce qu'elle trouve ailleurs. */
import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeSearchText } from './useSettingsSearch';
import { SETTINGS_SEARCH_INDEX } from '@/settingsSearchIndex';

describe('matchesQuery', () => {
  it('ignore les accents et la casse', () => {
    // Personne ne tape les accents dans un champ de recherche.
    expect(matchesQuery('Bibliothèque Plex', 'bibliotheque')).toBe(true);
    expect(matchesQuery('Améliorations VF', 'AMELIORATIONS')).toBe(true);
  });

  it('accepte les mots dans n’importe quel ordre', () => {
    // « plex token » doit trouver « Token Plex » comme « Plex : jeton d'accès ».
    expect(matchesQuery('Token Plex', 'plex token')).toBe(true);
    expect(matchesQuery('Token Plex', 'token plex')).toBe(true);
    expect(matchesQuery('Token Plex', 'plex radarr')).toBe(false);
  });

  it('ne retranche rien tant que rien n’est tapé', () => {
    // Une page de réglages vide au chargement serait déroutante.
    expect(matchesQuery("N'importe quoi", '')).toBe(true);
    expect(matchesQuery("N'importe quoi", '   ')).toBe(true);
  });
});

describe('index des réglages', () => {
  const trouve = (query) =>
    SETTINGS_SEARCH_INDEX.filter((entry) =>
      matchesQuery(`${entry.label} ${entry.group} ${entry.keywords.join(' ')}`, query)
    ).map((entry) => entry.label);

  it('répond « où vit ce réglage » pour les services qu’on cherche par leur nom', () => {
    // C'est le besoin qui a motivé l'index : les groupes sont devenus sept destinations,
    // et le nom d'un service n'apparaît dans aucun titre de panneau.
    expect(trouve('tracearr')).toEqual(['Intégrations']);
    expect(trouve('tautulli')).toEqual(['Intégrations']);
    expect(trouve('smtp')).toEqual(['Canaux']);
    expect(trouve('seed')).toEqual(['Téléchargements']);
  });

  it('mène au bon panneau pour un terme métier', () => {
    expect(trouve('doublage')).toContain('Améliorations VF');
    expect(trouve('cron')).toContain('Planification');
    expect(trouve('motif annulation')).toContain('Motifs de message');
  });

  it('ne propose rien pour un terme inconnu', () => {
    expect(trouve('kubernetes')).toEqual([]);
  });

  it('porte des chemins uniques et existants', () => {
    // Un doublon ferait apparaître deux fois la même destination dans les résultats.
    const chemins = SETTINGS_SEARCH_INDEX.map((entry) => entry.path);
    expect(new Set(chemins).size).toBe(chemins.length);
    for (const path of chemins) expect(path.startsWith('/')).toBe(true);
  });
});

describe('normalizeSearchText', () => {
  it('supporte les valeurs vides', () => {
    expect(normalizeSearchText('')).toBe('');
    expect(normalizeSearchText(undefined)).toBe('');
  });
});
