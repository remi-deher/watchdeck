import { describe, expect, it } from 'vitest';

import { formatPlexWebUrl } from './mediaUrl';

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
