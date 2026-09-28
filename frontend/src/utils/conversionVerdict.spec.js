import { describe, expect, it } from 'vitest';
import { conversionVerdict } from './conversionVerdict';

const audioOnly = {
  playback_method: 'transcode',
  transcode_details: {
    container: { from: 'mkv', to: 'mp4' },
    video: { decision: 'copy', from: 'hevc', to: 'hevc' },
    audio: { decision: 'transcode', from: 'dca', to: 'aac' },
  },
  transcode_reason: {
    source: 'plex',
    code: 3000,
    text: 'App cannot direct play this item. Direct play is disabled.',
    client: { directPlay: '0', directStream: '1', location: 'wan' },
  },
};

describe('conversionVerdict', () => {
  it('nomme ce qui est converti et pourquoi, en clair', () => {
    expect(conversionVerdict(audioOnly)).toEqual({
      title: 'Transcodage audio : le lecteur a refusé la lecture directe',
      explanation: 'La vidéo est inchangée, l’audio DTS est converti en AAC.',
      source: 'plex',
    });
  });

  it('reconnaît les causes courantes', () => {
    const channels = { ...audioOnly, transcode_reason: { source: 'plex', text: 'This app cannot play this item. The reason is: audio.channels limitation applies: 6 > 2.' } };
    expect(conversionVerdict(channels).title).toBe('Transcodage audio : le lecteur ne gère pas autant de canaux audio');
    const relay = { ...audioOnly, transcode_reason: null, stream_details: { relayed: true } };
    expect(conversionVerdict(relay).title).toBe('Transcodage audio : la connexion passe par le relais Plex, au débit limité');
    expect(conversionVerdict(relay).source).toBe('deduced');
    const quality = { ...audioOnly, transcode_reason: { source: 'plex', text: 'x', client: { maxVideoBitrate: '720' } } };
    expect(conversionVerdict(quality).title).toContain('qualité limitée par le lecteur (720 kb/s)');
  });

  it('décrit un Direct Stream comme une conversion légère', () => {
    const remux = {
      playback_method: 'direct_stream',
      transcode_details: { container: { from: 'mkv', to: 'mp4' }, video: { decision: 'copy' }, audio: { decision: 'copy' } },
    };
    expect(conversionVerdict(remux).title).toBe('Conversion légère : seul le conteneur change');
  });

  it('suit aussi une conversion légère où rien ne change en apparence', () => {
    const copied = {
      playback_method: 'direct_stream',
      transcode_details: { protocol: 'hls', container: { from: 'mp4', to: 'mp4' }, video: { decision: 'copy' }, audio: { decision: 'copy' } },
    };
    expect(conversionVerdict(copied).title).toBe('Conversion légère : flux recopiés sans réencodage');
  });

  it('ne dit rien d’une lecture directe', () => {
    expect(conversionVerdict({ playback_method: 'direct_play' })).toBeNull();
  });
});
