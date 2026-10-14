import { describe, expect, it } from 'vitest';
import { librariesToText, textToLibraries } from './plexServer';

describe('bibliotheques d un serveur Plex', () => {
  it('passe du JSON du serveur au texte, une bibliotheque par ligne', () => {
    expect(librariesToText('[{"name":"Films 4K","kind":"movie"},{"name":"Series","kind":"series"}]')).toBe('Films 4K | movie\nSeries | series');
  });
  it('lit un JSON invalide ou vide comme aucune bibliotheque', () => {
    expect(librariesToText('')).toBe('');
    expect(librariesToText('pas du json')).toBe('');
  });
  it('rend le JSON attendu, films par defaut, lignes vides ignorees', () => {
    expect(JSON.parse(textToLibraries('Films 4K\n\nMusique | music'))).toEqual([{ name: 'Films 4K', kind: 'movie' }, { name: 'Musique', kind: 'music' }]);
    expect(textToLibraries('  \n')).toBe('');
  });
});
