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
                  { language: 'Français', codec: 'ac3', channels: 6, bitrate_kbps: 640, sampling_rate: 48000, played: true },
                  { language: 'English', codec: 'dca', profile: 'dts-hd ma', channels: 8, bitrate_kbps: 3500, played: false },
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
    expect(video).not.toContain('Transcode');
    const audio = card(wrapper, 'Audio');
    expect(audio.text()).toContain('Français · AC3 · 5.1 · 640 kb/s');
    expect(audio.get('li.played').text()).toBe('FrançaisAC3 · 5.1 · 640 kb/s · 48 kHz');
    expect(audio.get('li.played').attributes('aria-current')).toBe('true');
    expect(audio.text()).not.toContain('Sélectionné');
    const others = audio.findAll('li:not(.played)');
    expect(others).toHaveLength(1);
    expect(others[0].text()).toBe('EnglishDTS · DTS-HD MA · 7.1 · 3,5 Mb/s');
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
    expect(audio).toContain('TranscodeAAC · stéréo · 256 kb/s');
    const container = card(wrapper, 'Conteneur').text();
    expect(container).toContain('TranscodeMP4');
    expect(container).toContain('segments DASH');
  });

  it('se contente des champs de la session pour un historique ancien', () => {
    const wrapper = mount(StreamTracksPanel, { props: { session: { video_codec: 'hevc', quality: '4k', audio_codec: 'eac3', container: 'mkv' } } });
    expect(card(wrapper, 'Vidéo').text()).toContain('HEVC · 4k');
    expect(card(wrapper, 'Audio').text()).toContain('E-AC3');
    expect(card(wrapper, 'Conteneur').text()).toContain('MKV');
  });

  it('ajoute une card Sous-titres avec la liste et celui sélectionné', () => {
    const wrapper = mount(StreamTracksPanel, {
      props: {
        session: {
          container: 'mkv',
          stream_details: {
            tracks: {
              container: { from: 'mkv', to: 'mkv' },
              subtitles: {
                decision: 'burn',
                to: null,
                languages: [
                  { language: 'Français', codec: 'srt', forced: true, selected: false },
                  { language: 'English', codec: 'pgs', hearing_impaired: true, title: 'SDH Netflix', selected: true },
                  { language: 'Español', codec: 'ass', external: true, title: 'Español (latino)', selected: false },
                ],
              },
            },
          },
        },
      },
    });
    expect(wrapper.get('.tracks-grid').attributes('style')).toContain('--cards: 2');
    const subs = card(wrapper, 'Sous-titres');
    expect(subs.get('.pill').text()).toBe('Incrusté');
    expect(subs.text()).toContain('English · SDH Netflix · PGS · SDH');
    expect(subs.text()).toContain('Incrustés dans la vidéo');
    expect(subs.get('.track-languages-title').text()).toBe('Sous-titres disponibles');
    expect(subs.get('li.played').text()).toBe('EnglishSDH Netflix · PGS · SDH');
    const others = subs.findAll('li:not(.played)').map((li) => li.text());
    expect(others).toEqual(['FrançaisSRT · Forcé', 'EspañolEspañol (latino) · ASS · Externe']);
  });

  it('dit la conversion des sous-titres et leur absence', () => {
    const converted = mount(StreamTracksPanel, {
      props: { session: { stream_details: { tracks: { subtitles: { decision: 'transcode', to: 'ass', languages: [{ language: 'Deutsch', codec: 'srt', selected: true }] } } } } },
    });
    const subs = card(converted, 'Sous-titres');
    expect(subs.get('.pill').text()).toBe('Converti');
    expect(subs.text()).toContain('Transcode');
    expect(subs.text()).toContain('ASS');

    const off = mount(StreamTracksPanel, {
      props: { session: { stream_details: { tracks: { subtitles: { decision: null, languages: [{ language: 'Deutsch', codec: 'srt', selected: false }] } } } } },
    });
    const offCard = card(off, 'Sous-titres');
    expect(offCard.get('.pill').text()).toBe('Désactivés');
    expect(offCard.text()).toContain('Aucun');

    const legacy = mount(StreamTracksPanel, { props: { session: { subtitle_decision: 'copy' } } });
    expect(card(legacy, 'Sous-titres').get('.pill').text()).toBe('Direct');
    expect(mount(StreamTracksPanel, { props: { session: {} } }).find('.track-card').exists()).toBe(false);
  });

  it('met une carte à longue liste de pistes sur sa propre ligne', () => {
    const langs = ['norsk', 'English', 'Dansk', 'Deutsch', 'Français'].map((language, index) => ({ language, codec: 'srt', selected: index === 4 }));
    const wrapper = mount(StreamTracksPanel, {
      props: {
        session: {
          stream_details: {
            tracks: {
              video: { decision: 'copy', from: { codec: 'hevc', height: 720 } },
              audio: { decision: 'copy', from: { codec: 'aac' }, languages: [{ language: 'norsk', codec: 'aac', played: true }] },
              container: { from: 'mkv', to: 'mp4' },
              subtitles: { decision: 'transcode', to: 'ass', languages: langs },
            },
          },
        },
      },
    });
    // Vidéo, audio et conteneur partagent la premiere ligne ; les sous-titres prennent la suivante.
    expect(wrapper.get('.tracks-grid').attributes('style')).toContain('--cards: 3');
    expect(card(wrapper, 'Sous-titres').classes()).toContain('wide');
    expect(card(wrapper, 'Audio').classes()).not.toContain('wide');
    expect(card(wrapper, 'Sous-titres').findAll('li')).toHaveLength(5);
  });
});
