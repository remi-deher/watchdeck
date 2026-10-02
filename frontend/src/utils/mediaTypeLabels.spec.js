import { describe, expect, it } from 'vitest';

import { isMusicType, mediaTypeLabel, mediaTypePluralLabel } from './labels';

describe('libelles des types de media', () => {
  it('nomme les trois types musicaux au lieu de les presenter comme des films', () => {
    expect(mediaTypeLabel('artist')).toBe('Artiste');
    expect(mediaTypeLabel('album')).toBe('Album');
    expect(mediaTypeLabel('track')).toBe('Titre');
    expect(['artist', 'album', 'track'].map(mediaTypePluralLabel)).toEqual(['Musique', 'Musique', 'Musique']);
  });

  it('garde Film pour un film et pour une demande ancienne sans type', () => {
    expect(mediaTypeLabel('movie')).toBe('Film');
    expect(mediaTypeLabel(null)).toBe('Film');
    expect(mediaTypeLabel('show')).toBe('Série');
    expect(mediaTypeLabel('inconnu')).toBe('Média');
  });

  it('reconnait la musique', () => {
    expect(['artist', 'album', 'track'].every(isMusicType)).toBe(true);
    expect(isMusicType('movie')).toBe(false);
    expect(isMusicType(undefined)).toBe(false);
  });
});
