import { describe, expect, it } from 'vitest';

import {
  episodeStatusClass,
  episodeStatusLabel,
  hasSubtitleAlert,
  seasonHeading,
  seasonSubtitleAlerts,
  subtitleAlerts,
} from './mediaStreams';

describe('mediaStreams', () => {
  it('signale un fichier non francophone sans aucune piste de sous-titre', () => {
    expect(subtitleAlerts([{ is_fr: false }], [])).toEqual({
      subFrNoTrack: true, subFrAbsent: false, subFrNotDefault: false, forcedFrNotDefault: false,
    });
  });

  it('distingue le sous-titre FR absent et non activé', () => {
    expect(subtitleAlerts([], [{ is_fr: false }]).subFrAbsent).toBe(true);
    expect(subtitleAlerts([], [{ is_fr: true, is_default: false }]).subFrNotDefault).toBe(true);
    expect(hasSubtitleAlert(subtitleAlerts([], [{ is_fr: true, is_default: true }]))).toBe(false);
  });

  it('pour un fichier francophone, ne regarde que le forcé FR', () => {
    const alerts = subtitleAlerts([{ is_fr: true }], [{ is_fr: true, is_forced: true }]);
    expect(alerts).toEqual({ subFrNoTrack: false, subFrAbsent: false, subFrNotDefault: false, forcedFrNotDefault: true });
  });

  it('reprend les compteurs d’une saison sous les clés des alertes', () => {
    expect(seasonSubtitleAlerts({ sub_fr_absent: 3 })).toMatchObject({ subFrAbsent: 3, subFrNoTrack: undefined });
    expect(hasSubtitleAlert(seasonSubtitleAlerts(null))).toBe(false);
  });

  it('nomme le statut d’un épisode et sa pastille', () => {
    expect(episodeStatusLabel('vf_secondary')).toBe('VF (sec.)');
    expect(episodeStatusLabel('mixte')).toBe('MIXTE');
    expect(episodeStatusClass('absent')).toBe('danger');
    expect(episodeStatusClass('vo')).toBe('');
  });

  it('ne répète pas un nom de saison générique', () => {
    expect(seasonHeading({ season_number: 2, name: 'Saison 2' })).toBe('Saison 2');
    expect(seasonHeading({ season_number: 2, name: 'Le retour' })).toBe('Saison 2 — Le retour');
  });
});
