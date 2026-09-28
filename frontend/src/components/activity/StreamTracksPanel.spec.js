import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StreamTracksPanel from './StreamTracksPanel.vue';

const card = (wrapper, label) => wrapper.findAll('.track-card').find((c) => c.get('header strong').text() === label);

describe('StreamTracksPanel', () => {
  it('décrit vidéo, audio et conteneur d’une lecture directe, avec les langues disponibles', () => {
    const wrapper = mount(StreamTracksPanel, {
      props: {
        session: {
          playback_method: 'direct_play',
          stream_details: {
            tracks: {
              container: { from: 'mkv', to: 'mkv', converted: false },
              video: { decision: 'directplay', from: { codec: 'h264', height: 1080, bitrate_kbps: 8000 }, to: { codec: 'h264', height: 1080, bitrate_kbps: 8000 } },
              audio: {
                decision: 'directplay',
                from: { codec: 'ac3', channels: 6, bitrate_kbps: 640, language: 'Français' },
                to: { codec: 'ac3', channels: 6, bitrate_kbps: 640, language: 'Français' },
                languages: [
                  { language: 'Français', codec: 'ac3', channels: 6, played: true },
                  { language: 'English', codec: 'dca', channels: 6, played: false },
                ],
              },
            },
          },
        },
      },
    });
    const video = card(wrapper, 'Vidéo').text();
    expect(video).toContain('H.264 · 1080p · 8 Mb/s');
    expect(video).toContain('Direct');
    expect(video).not.toContain('Envoyée');
    const audio = card(wrapper, 'Audio');
    expect(audio.text()).toContain('Français · AC3 · 5.1 · 640 kb/s');
    expect(audio.get('li.played').text()).toBe('Français · AC3 · 5.1');
    expect(audio.findAll('li')).toHaveLength(2);
    expect(card(wrapper, 'Conteneur').text()).toContain('Inchangé');
  });

  it('dit ce qui est converti et vers quoi', () => {
    const wrapper = mount(StreamTracksPanel, {
      props: {
        session: {
          playback_method: 'transcode',
          stream_details: {
            tracks: {
              container: { from: 'mkv', to: 'mp4', protocol: 'dash' },
              video: { decision: 'copy', from: { codec: 'hevc', height: 2160 }, to: { codec: 'hevc', height: 2160 } },
              audio: { decision: 'transcode', from: { codec: 'truehd', channels: 8, language: 'English' }, to: { codec: 'aac', channels: 2, bitrate_kbps: 256 }, languages: [] },
            },
          },
        },
      },
    });
    expect(card(wrapper, 'Vidéo').text()).toContain('Copié');
    const audio = card(wrapper, 'Audio').text();
    expect(audio).toContain('Converti');
    expect(audio).toContain('EnvoyéAAC · stéréo · 256 kb/s');
    const container = card(wrapper, 'Conteneur').text();
    expect(container).toContain('EnvoyéMP4');
    expect(container).toContain('segments DASH');
  });

  it('se contente des champs de la session pour un historique ancien', () => {
    const wrapper = mount(StreamTracksPanel, { props: { session: { video_codec: 'hevc', quality: '4k', audio_codec: 'eac3', container: 'mkv' } } });
    expect(card(wrapper, 'Vidéo').text()).toContain('HEVC · 4k');
    expect(card(wrapper, 'Audio').text()).toContain('E-AC3');
    expect(card(wrapper, 'Conteneur').text()).toContain('MKV');
  });
});
