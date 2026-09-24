import { describe, expect, it } from 'vitest';
import { formatBytes, formatEta, formatSpeed, formatTracker, maskTitle, statusClass, statusLabel } from './torrentFormat';

describe('torrentFormat', () => {
  it('met en forme tailles, debits et temps restant', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(2048)).toBe('2 Ko');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 Go');
    expect(formatSpeed(1024)).toBe('1 Ko/s');
    expect(formatEta(0)).toBe('—');
    expect(formatEta(8640000)).toBe('—');
    expect(formatEta(3900)).toBe('1 h 5 min');
    expect(formatEta(300)).toBe('5 min');
  });

  it('reduit un tracker a son hote', () => {
    expect(formatTracker('https://tracker.one:443/announce, udp://two.org')).toBe('tracker.one');
    expect(formatTracker('two.org')).toBe('two.org');
    expect(formatTracker('')).toBe('—');
  });

  it('anonymise les titres en gardant leur fin', () => {
    expect(maskTitle('Un.Film.2024.1080p', 0)).toBe('Linux ISO #1 (.1080p)');
    expect(maskTitle('', 2)).toBe('Linux ISO #3');
  });

  it('traduit l etat du client', () => {
    expect([statusClass({ status: 'error' }), statusLabel({ status: 'error' })]).toEqual(['error', 'Erreur']);
    expect([statusClass({ status: 'pausedDL' }), statusLabel({ status: 'pausedDL' })]).toEqual(['paused', 'En pause']);
    expect([statusClass({ status: 'stalledUP', progress: 100 }), statusLabel({ status: 'stalledUP', progress: 100 })]).toEqual(['complete', 'En partage']);
    expect(statusLabel({ status: 'checkingDL' })).toBe('Vérification');
    expect(statusLabel({ status: 'queuedDL' })).toBe('En attente');
    expect(statusLabel({ status: 'downloading' })).toBe('Téléchargement');
  });
});
