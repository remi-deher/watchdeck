import { describe, expect, it } from 'vitest';
import { bufferIsLow, formatBuffer, hasTranscodeBuffer, transcodeSpeedLabel } from './transcodeBuffer';

describe('transcodeBuffer', () => {
  it('ne concerne que les transcodages en cours dont Plex donne le tampon', () => {
    expect(hasTranscodeBuffer({ playback_method: 'transcode', transcode_buffer_ms: 5000 })).toBe(true);
    expect(hasTranscodeBuffer({ playback_method: 'direct_play', transcode_buffer_ms: 5000 })).toBe(false);
    expect(hasTranscodeBuffer({ playback_method: 'transcode', transcode_buffer_ms: null })).toBe(false);
    expect(hasTranscodeBuffer({ playback_method: 'transcode', transcode_buffer_ms: 5000, ended_at: '2026-09-24T18:00:00' })).toBe(false);
  });

  it('formate le tampon en secondes puis en minutes', () => {
    expect(formatBuffer(45_400)).toBe('45 s');
    expect(formatBuffer(72_000)).toBe('1 min 12 s');
    expect(formatBuffer(120_000)).toBe('2 min');
    expect(formatBuffer(725_000)).toBe('12 min');
  });

  it('dit la vitesse et le bridage, et signale un tampon bas', () => {
    expect(transcodeSpeedLabel({ transcode_speed: 2.4, transcode_throttled: true })).toBe('Transcodeur ×2,4 · bridé, assez d’avance');
    expect(transcodeSpeedLabel({})).toBe('Transcodage en cours');
    expect(bufferIsLow(4_000)).toBe(true);
    expect(bufferIsLow(30_000)).toBe(false);
  });
});
