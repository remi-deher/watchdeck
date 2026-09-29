import { describe, expect, it } from 'vitest';
import { audioTrackDetail, channelsLabel, resolutionLabel, watchedPercent } from './mediaTechnical';

describe('mediaTechnical', () => {
  it('nomme les resolutions et les canaux comme on les lit', () => {
    expect(resolutionLabel('4k')).toBe('4K');
    expect(resolutionLabel('1080')).toBe('1080p');
    expect(resolutionLabel('Inconnue')).toBe('');
    expect(channelsLabel(6)).toBe('5.1');
    expect(channelsLabel(5)).toBe('5 canaux');
  });

  it('borne la part vue a 100 % et se tait sans duree', () => {
    expect(watchedPercent(2_700_000, 3_600_000)).toBe(75);
    expect(watchedPercent(4_000_000, 3_600_000)).toBe(100);
    expect(watchedPercent(1000, 0)).toBeNull();
  });

  it("ne repete pas le codec quand le profil le nomme deja", () => {
    expect(audioTrackDetail({ codec: 'dca', profile: 'dts-hd ma', channels: 8 })).toBe('DTS-HD MA · 7.1');
    expect(audioTrackDetail({ codec: 'aac', profile: 'lc', channels: 2, bitrate_kbps: 192 })).toBe('AAC LC · stéréo · 192 kb/s');
  });
});
