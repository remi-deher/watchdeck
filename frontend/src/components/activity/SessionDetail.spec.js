import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SessionDetail from './SessionDetail.vue';

function factory(session) {
  return mount(SessionDetail, {
    props: { session },
    global: {
      stubs: {
        MediaArtwork: true,
        PlaybackMethodBadge: true,
        SessionLocationMap: true,
        SessionTimelineBar: true,
      },
    },
  });
}

function connectionKpi(wrapper) {
  return wrapper.get('.network-kpi');
}

describe('SessionDetail - connexion', () => {
  it('affiche Locale pour stream_location=lan', () => {
    const wrapper = factory({ title: 'Film', location: 'lan', geo_status: 'resolved' });
    expect(connectionKpi(wrapper).text()).toContain('Locale');
    expect(connectionKpi(wrapper).classes()).toContain('local');
  });

  it('affiche Locale pour geo_status=local même sans stream_location', () => {
    const wrapper = factory({ title: 'Film', geo_status: 'local', address: '192.168.1.25' });
    expect(connectionKpi(wrapper).text()).toContain('Locale');
  });

  it('affiche Distante pour stream_location=wan', () => {
    const wrapper = factory({ title: 'Film', location: 'wan', geo_status: 'resolved' });
    expect(connectionKpi(wrapper).text()).toContain('Distante');
    expect(connectionKpi(wrapper).classes()).toContain('remote');
  });

  it('affiche Distante quand stream_location est absent mais geo_status=resolved (session Hyper tension 2)', () => {
    const wrapper = factory({
      title: 'Hyper tension 2',
      address: '82.64.10.20',
      geo_status: 'resolved',
      geo_city: 'Yutz',
      geo_country: 'France',
      geo_isp: 'Orange S.A.',
      geo_organization: 'POP DIJ',
      geo_asn: 'AS3215',
    });
    expect(connectionKpi(wrapper).text()).toContain('Distante');
    expect(connectionKpi(wrapper).text()).toContain('Orange S.A.');
  });

  it('affiche Distante pour une IP publique même sans geo_status résolu', () => {
    const wrapper = factory({ title: 'Film', address: '82.64.10.20' });
    expect(connectionKpi(wrapper).text()).toContain('Distante');
  });

  it('réserve Non déterminée aux cas réellement impossibles à trancher', () => {
    const wrapper = factory({ title: 'Film' });
    expect(connectionKpi(wrapper).text()).toContain('Non déterminée');
  });

  it('affiche une formulation neutre quand aucun enrichissement réseau n’est disponible', () => {
    const wrapper = factory({ title: 'Film', address: '82.64.10.20', geo_status: 'resolved' });
    expect(connectionKpi(wrapper).text()).toContain('via une adresse publique');
  });

  it('utilise geo_organization en repli quand geo_isp est absent', () => {
    const wrapper = factory({
      title: 'Film',
      address: '82.64.10.20',
      geo_status: 'resolved',
      geo_organization: 'POP DIJ',
    });
    expect(connectionKpi(wrapper).text()).toContain('POP DIJ');
  });

  it('affiche le temps en pause quand paused_ms est présent', () => {
    const wrapper = factory({
      title: 'Film',
      duration_ms: 7200000,
      watched_ms: 3600000,
      paused_ms: 900000,
    });
    expect(wrapper.text()).toContain('Temps en pause');
    expect(wrapper.text()).toContain('15 min');
  });
});

describe('SessionDetail - fiche de l’œuvre et conversion', () => {
  const flibustiers = {
    title: 'Les flibustiers de la nuit [2/2]',
    grandparent_title: 'Samurai Champloo',
    year: 2004,
    playback_method: 'direct_stream',
    progress_ms: 25000,
    duration_ms: 100000,
    transcode_buffer_ms: 25000,
    transcode_throttled: true,
    transcode_remux: null,
    transcode_details: {
      protocol: 'http',
      transcoder: { complete: false, progress: 40 },
      container: { from: 'mkv', to: 'mkv' },
      video: { decision: 'copy', from: 'hevc', to: 'hevc', height: 1080 },
      audio: { decision: 'copy', from: 'aac', to: 'aac', channels: 2, language: 'Français' },
      subtitles: { decision: 'transcode', from: 'ass', to: 'webvtt', language: 'Français', forced: true },
    },
    media: { summary: 'Mugen embarque sur un navire.', art_url: '/api/playback/thumb?path=x', season: 1, episode: 11, library_item_id: 42 },
  };

  it('montre la bannière, l’épisode et le résumé, et rend l’affiche cliquable', () => {
    const wrapper = factory(flibustiers);
    expect(wrapper.get('.session-banner').classes()).toContain('has-art');
    expect(wrapper.get('.session-heading').text()).toContain('Samurai Champloo · S1 · É11 · 2004');
    expect(wrapper.get('.session-summary').text()).toContain('Mugen embarque');
    expect(wrapper.get('.session-poster').element.tagName).toBe('BUTTON');
  });

  it('sans fiche bibliothèque, l’affiche n’est pas un bouton', () => {
    const wrapper = factory({ ...flibustiers, media: { ...flibustiers.media, library_item_id: null } });
    expect(wrapper.get('.session-poster').element.tagName).toBe('DIV');
  });

  it('dessine le tampon devant la tête de lecture et l’état du transcodeur', () => {
    const wrapper = factory(flibustiers);
    const zone = wrapper.get('.buffer-zone');
    expect(zone.attributes('style')).toContain('left: 25%');
    expect(zone.attributes('style')).toContain('width: 25%');
    expect(wrapper.get('.buffer-legend').text()).toContain('Transcodeur en pause : assez d’avance');
  });

  it('détaille la conversion flux par flux, avec les couleurs des pastilles', () => {
    const rows = factory(flibustiers).findAll('.conversion-row');
    expect(rows.map((row) => row.get('.conversion-label').text())).toEqual(['Conteneur', 'Vidéo', 'Audio', 'Sous-titres']);
    expect(rows[0].get('.conversion-treatment').text()).toBe('Identique');
    expect(rows[1].get('.conversion-treatment').classes()).toContain('copied');
    expect(rows[3].text()).toContain('ASS · Français forcés');
    expect(rows[3].get('.conversion-treatment').classes()).toContain('converted');
  });

  it('signale un changement de conteneur en bleu', () => {
    const details = { ...flibustiers.transcode_details, container: { from: 'mkv', to: 'mp4' }, protocol: 'dash' };
    const row = factory({ ...flibustiers, transcode_details: details }).findAll('.conversion-row')[0];
    expect(row.text()).toContain('MP4 · DASH');
    expect(row.get('.conversion-treatment').classes()).toContain('remuxed');
  });

  it('une ancienne lecture sans détail garde le chemin du flux', () => {
    const wrapper = factory({ title: 'Film', playback_method: 'transcode', video_decision: 'transcode' });
    expect(wrapper.find('.stream-route').exists()).toBe(true);
    expect(wrapper.find('.conversion-table').exists()).toBe(false);
  });
});
