import { describe, expect, it } from 'vitest';
import { estimateProgressMs, estimatedEnd, isAdvancing, timecode } from './playbackClock';

const seen = '2026-09-27T20:00:00Z';
const at = (seconds) => Date.parse(seen) + seconds * 1000;

describe('playbackClock', () => {
  it('avance la position depuis le dernier relevé tant que la lecture joue', () => {
    const session = { state: 'playing', last_seen_at: seen, progress_ms: 60_000, duration_ms: 600_000 };
    expect(estimateProgressMs(session, at(0))).toBe(60_000);
    expect(estimateProgressMs(session, at(12))).toBe(72_000);
  });

  it('reste figée en pause ou une fois terminée', () => {
    expect(estimateProgressMs({ state: 'paused', last_seen_at: seen, progress_ms: 60_000 }, at(30))).toBe(60_000);
    expect(estimateProgressMs({ state: 'playing', ended_at: seen, last_seen_at: seen, progress_ms: 60_000 }, at(30))).toBe(60_000);
    expect(isAdvancing({ state: 'buffering' })).toBe(false);
  });

  it('ne dépasse ni la durée ni une minute sans nouveau relevé', () => {
    expect(estimateProgressMs({ state: 'playing', last_seen_at: seen, progress_ms: 590_000, duration_ms: 600_000 }, at(30))).toBe(600_000);
    expect(estimateProgressMs({ state: 'playing', last_seen_at: seen, progress_ms: 0 }, at(600))).toBe(60_000);
  });

  it('donne l’heure de fin tant que la lecture avance', () => {
    const session = { state: 'playing', last_seen_at: seen, progress_ms: 0, duration_ms: 600_000 };
    expect(estimatedEnd(session, at(0)).getTime()).toBe(at(600));
    expect(estimatedEnd({ ...session, state: 'paused' }, at(0))).toBeNull();
  });

  it('formate comme un lecteur', () => {
    expect(timecode(727_000)).toBe('12:07');
    expect(timecode(3_849_000)).toBe('1:04:09');
    expect(timecode(null)).toBe('0:00');
  });
});
