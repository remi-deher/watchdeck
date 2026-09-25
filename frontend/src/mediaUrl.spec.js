import { describe, expect, it } from 'vitest';

import { formatPlexWebUrl, mediaDetailPath } from './mediaUrl';

describe('formatPlexWebUrl', () => {
  it('construit la route Plex globale depuis un GUID Plex', () => {
    expect(formatPlexWebUrl('plex://movie/abc-123')).toBe(
      'https://app.plex.tv/desktop/#!/provider/tv.plex.provider.discover/details' +
      '?key=%2Flibrary%2Fmetadata%2Fabc-123',
    );
  });

  it.each(['local://42', 'mbid://artist/42'])(
    'ne fabrique pas de lien global invalide pour %s',
    (guid) => {
      expect(formatPlexWebUrl(guid)).toBeNull();
    },
  );
});

describe('mediaDetailPath et la musique', () => {
  it("ouvre un album de bibliotheque par son id de bibliotheque, jamais comme fiche TMDB", () => {
    // Cas reel : l'album « Mirage » (id 3993) ouvrait /discover/.../3993?media_type=album.
    expect(mediaDetailPath({ id: 3993, media_type: 'album', _kind: 'library' }, 'library')).toBe('/library/media/library/3993');
    expect(mediaDetailPath({ id: 3993, media_type: 'album' }, 'discover')).toBe('');
    expect(mediaDetailPath({ id: 1, library_id: 3993, media_type: 'track' }, 'discover')).toBe('/library/media/library/3993');
  });

  it('garde le mode Decouvrir pour les films et series TMDB', () => {
    expect(mediaDetailPath({ tmdb_id: 27205, media_type: 'movie' }, 'discover')).toBe('/discover/media/discover/27205?media_type=movie');
  });
});
