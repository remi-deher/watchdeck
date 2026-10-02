import { describe, expect, it } from 'vitest';
import { plexPhrase, translatePlexPhrase } from './plexDecisionText';

describe('plexDecisionText', () => {
  it('traduit les phrases de décision connues', () => {
    expect(translatePlexPhrase('App cannot direct play this item. Direct play is disabled.')).toBe('Le lecteur a désactivé la lecture directe');
    expect(translatePlexPhrase('media must be transcoded in order to use the dash protocol')).toBe('Le protocole DASH impose une conversion');
    expect(translatePlexPhrase('no direct play video profile exists for http/mkv/hevc/dca')).toBe('Aucun profil de lecture directe pour http/mkv/hevc/dca');
    expect(translatePlexPhrase("Audio Direct Streaming is disabled, so video's audio stream will be transcoded")).toBe('Conversion légère de l’audio désactivée : l’audio est réencodé');
  });

  it('traduit la raison imbriquée de « This app cannot play this item »', () => {
    expect(translatePlexPhrase('This app cannot play this item. The reason is: audio.channels limitation applies: 6 > 2.'))
      .toBe('Le lecteur ne peut pas lire ce fichier : trop de canaux audio pour le lecteur (6 > 2)');
  });

  it('laisse une phrase inconnue en anglais plutôt que de la paraphraser', () => {
    expect(translatePlexPhrase('Some brand new Plex message')).toBeNull();
    expect(plexPhrase('Some brand new Plex message')).toBe('Some brand new Plex message');
    expect(translatePlexPhrase('')).toBeNull();
  });
});
