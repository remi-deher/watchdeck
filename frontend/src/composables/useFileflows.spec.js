import { describe, expect, it } from 'vitest';
import { FILEFLOWS_STATUS, fileBaseName, fileStatusTone, formatSeconds, sizeChange } from './useFileflows';

describe('useFileflows', () => {
  it('donne le nom du fichier sans ses dossiers', () => {
    expect(fileBaseName('Série (2007)/Saison 06/Série - S06E01.mkv')).toBe('Série - S06E01.mkv');
    expect(fileBaseName('fichier.mkv')).toBe('fichier.mkv');
  });

  it('calcule le gain de taille, ou rien quand une taille manque', () => {
    expect(sizeChange({ original_size: 1000, final_size: 750 })).toBe(-25);
    expect(sizeChange({ original_size: 1000, final_size: 1100 })).toBe(10);
    expect(sizeChange({ original_size: 1000, final_size: null })).toBeNull();
  });

  it('associe une tonalite a chaque statut', () => {
    expect(fileStatusTone(FILEFLOWS_STATUS.processed)).toBe('success');
    expect(fileStatusTone(FILEFLOWS_STATUS.processing)).toBe('info');
    expect(fileStatusTone(FILEFLOWS_STATUS.failed)).toBe('danger');
    expect(fileStatusTone(FILEFLOWS_STATUS.queued)).toBe('neutral');
    expect(fileStatusTone(-2)).toBe('warning');
  });

  it('formate une duree en secondes, minutes ou heures', () => {
    expect(formatSeconds(42.4)).toBe('42 s');
    expect(formatSeconds(282.5)).toBe('4 min 43');
    expect(formatSeconds(3780)).toBe('1 h 03');
    expect(formatSeconds(null)).toBe('0 s');
  });
});
