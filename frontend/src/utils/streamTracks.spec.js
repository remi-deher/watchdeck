import { describe, expect, it } from 'vitest';
import { streamTracksSummary } from './streamTracks';

describe('streamTracksSummary', () => {
  it('résume vidéo, audio et conteneur, avec ce qui est converti', () => {
    const session = {
      stream_details: {
        tracks: {
          container: { from: 'mkv', to: 'mp4' },
          video: { decision: 'copy', from: { codec: 'hevc', height: 2160 } },
          audio: { decision: 'transcode', from: { codec: 'truehd', channels: 8, language: 'English' }, to: { codec: 'aac', channels: 2 } },
        },
      },
    };
    expect(streamTracksSummary(session)).toBe('Vidéo HEVC 2160p · Audio TrueHD 7.1 → AAC stéréo (English) · MKV → MP4');
  });

  it('ne dit rien sans détail des flux', () => {
    expect(streamTracksSummary({})).toBe('');
  });
});
