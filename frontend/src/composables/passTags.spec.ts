import { describe, expect, it } from 'vitest';
import { passTags, type FileflowsPass } from './useFileflows';

const pass = (before: any, after: any) => ({ status: 'processed', before, after } as FileflowsPass);

describe('passTags', () => {
  it('nomme ce qui a ete retouche', () => {
    expect(passTags(pass(
      { video: { codec: 'h264', height: 1080 }, audio: [{ codec: 'dts', title: 'VF' }, { codec: 'eac3', title: 'VO' }], subtitles: [{ codec: 'subrip', title: 'FR' }] },
      { video: { codec: 'hevc', height: 1080 }, audio: [{ codec: 'ac3', title: 'VF' }, { codec: 'ac3', title: 'VO' }], subtitles: [{ codec: 'ass', title: 'FR' }] },
    ))).toEqual(['Vidéo', 'Audio DTS', 'Audio E-AC3', 'Sous-titres SRT']);
  });
  it('signale les pistes renommees ou retirees, rien sans apres', () => {
    expect(passTags(pass({ audio: [{ codec: 'ac3', title: 'a' }] }, { audio: [{ codec: 'ac3', title: 'Français / AC3 / 5.1' }] }))).toEqual(['Pistes renommées']);
    expect(passTags(pass({ audio: [{ codec: 'ac3' }, { codec: 'ac3' }] }, { audio: [{ codec: 'ac3' }] }))).toEqual(['Pistes retirées']);
    expect(passTags(pass({ audio: [{ codec: 'dts' }] }, null))).toEqual([]);
  });
});
