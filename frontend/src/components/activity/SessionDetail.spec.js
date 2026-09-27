import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

/* La fiche lit l'etat de la feuille (en surface ou en pleine page) dans la route : sans
   routeur dans ces tests, on la pose en pleine page. */
vi.mock('@/composables/useMediaOverlay', () => ({
  useMediaOverlay: () => ({ routeDeFond: ref(null), actif: ref(false) }),
  ouvrirFiche: () => {},
}));
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
    // Le temps en pause est dans la carte « Chronologie ».
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
    // Meme en-tete que la fiche d'un media : l'image de la serie en fond.
    expect(wrapper.get('.ui-hero-backdrop__image').attributes('style')).toContain('/api/playback/thumb?path=x');
    expect(wrapper.get('.session-heading').text()).toContain('Samurai Champloo · S1 · É11 · 2004');
    expect(wrapper.get('.session-summary').text()).toContain('Mugen embarque');
    expect(wrapper.get('.session-poster').element.tagName).toBe('BUTTON');
  });

  it('ne propose « Lire la suite » que si le résumé déborde', async () => {
    // jsdom ne mesure rien : un résumé qui tient dans ses lignes n'a pas de bouton.
    expect(factory(flibustiers).find('.sheet-summary__toggle').exists()).toBe(false);
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
    const rows = factory(flibustiers).findAll('.conversion-flow');
    expect(rows.map((row) => row.get('.flow-label').text())).toEqual(['Conteneur', 'Vidéo', 'Audio', 'Sous-titres']);
    expect(rows[0].get('.pill').text()).toBe('Inchangé');
    expect(rows[1].get('.pill').text()).toBe('Inchangée');
    expect(rows[1].get('.pill').classes()).toContain('copied');
    expect(rows[3].text()).toContain('ASS → WebVTT · forcés');
    expect(rows[3].get('.pill').classes()).toContain('converted');
  });

  it('signale un changement de conteneur en bleu', () => {
    const details = { ...flibustiers.transcode_details, container: { from: 'mkv', to: 'mp4' }, protocol: 'dash' };
    const row = factory({ ...flibustiers, transcode_details: details }).findAll('.conversion-flow')[0];
    expect(row.text()).toContain('MKV → MP4');
    expect(row.get('.pill').text()).toBe('Changé · diffusion en segments');
    expect(row.get('.pill').attributes('title')).toBe('Protocole DASH');
    expect(row.get('.pill').classes()).toContain('remuxed');
  });

  it('une ancienne lecture sans détail garde le chemin du flux', () => {
    const wrapper = factory({ title: 'Film', playback_method: 'transcode', video_decision: 'transcode' });
    expect(wrapper.find('.stream-route').exists()).toBe(true);
    expect(wrapper.find('.conversion-table').exists()).toBe(false);
  });
});

describe('SessionDetail - réseau, HDR, lecteur et arrêt', () => {
  const live = {
    id: 12,
    title: 'Dune',
    playback_method: 'transcode',
    bandwidth_kbps: 4200,
    transcode_details: { container: { from: 'mkv', to: 'mkv' }, video: { decision: 'transcode', from: 'hevc', to: 'h264', height: 1080 } },
    stream_details: {
      relayed: true,
      secure: true,
      player: { product: 'Plex for Android (TV)', version: '10.2', vendor: 'NVIDIA', model: 'SHIELD', platform: 'Android', platform_version: '11' },
      bitrate: { source_kbps: 62000, stream_kbps: 4200, video_kbps: 3800, audio_kbps: 192 },
      dynamic_range: { source: 'HDR10', output: 'SDR' },
    },
  };

  it('signale le relais, le tone mapping et la qualité réduite', () => {
    const wrapper = factory(live);
    expect(wrapper.get('.session-flag.relay').text()).toContain('Relais Plex');
    expect(wrapper.get('.session-flag.hdr').text()).toBe('HDR10 → SDR');
    expect(wrapper.get('.session-flag.hdr').classes()).toContain('tonemap');
    expect(wrapper.text()).toContain('qualité réduite');
    const range = wrapper.findAll('.conversion-flow').find((row) => row.text().includes('Plage dynamique'));
    expect(range.get('.pill').text()).toBe('HDR converti en SDR');
  });

  it('ne parle de qualité réduite que si la vidéo est réencodée', () => {
    expect(factory({ ...live, playback_method: 'direct_play', transcode_details: null }).text()).not.toContain('qualité réduite');
    // Audio seul converti (DTS -> AAC), vidéo copiée : l'image n'est pas touchée.
    const audioOnly = { ...live.transcode_details, video: { decision: 'copy', from: 'hevc', to: 'hevc' } };
    expect(factory({ ...live, transcode_details: audioOnly }).text()).not.toContain('qualité réduite');
  });

  it('décrit l’application et l’appareil du lecteur', () => {
    const text = factory(live).text();
    expect(text).toContain('Plex for Android (TV) 10.2');
    expect(text).toContain('NVIDIA SHIELD');
    expect(text).toContain('Android 11');
  });

  it('propose d’arrêter une lecture en cours, pas une lecture terminée', () => {
    expect(factory(live).find('.terminate-button').exists()).toBe(true);
    expect(factory({ ...live, ended_at: '2026-09-27T10:00:00Z' }).find('.terminate-button').exists()).toBe(false);
  });

  it('signale un téléchargement', () => {
    expect(factory({ ...live, is_download: true }).get('.session-flag.download').text()).toContain('Téléchargement');
  });
});

describe('SessionDetail - repères de temps', () => {
  const now = Date.parse('2026-09-27T20:00:00Z');
  const base = {
    id: 3, title: 'Film', state: 'playing', last_seen_at: '2026-09-27T20:00:00Z', started_at: '2026-09-27T19:30:00Z',
    progress_ms: 1_800_000, duration_ms: 5_400_000, paused_ms: 120_000,
    media: { library_item_id: 42 },
  };

  it('affiche position, restant, fin prévue, durée, début et pause', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const wrapper = factory(base);
    const times = wrapper.get('.progress-times').text();
    expect(times).toContain('30:00');
    expect(times).toContain('-1:00:00');
    const markers = wrapper.get('.progress-markers').text();
    expect(markers).toContain('Fin prévue');
    expect(markers).toContain('1:30:00');
    expect(markers).toContain('Commencée');
    // Le temps en pause est passé dans la carte « Chronologie ».
    expect(wrapper.text()).toContain('Temps en pause');
    expect(wrapper.get('.progress-cursor').attributes('style')).toContain('left: 33.3');
    vi.useRealTimers();
  });

  it('en pause, remplace le restant par « En pause » et suspend la fin', () => {
    const wrapper = factory({ ...base, state: 'paused' });
    expect(wrapper.get('.progress-times').text()).toContain('En pause');
    expect(wrapper.get('.progress-cursor').classes()).toContain('paused');
    expect(wrapper.get('.progress-markers').text()).toContain('suspendue');
  });

  it('n’a plus de bouton « Ouvrir la fiche du media » : l’affiche y mène', () => {
    const wrapper = factory(base);
    expect(wrapper.find('[aria-label="Ouvrir la fiche du media"]').exists()).toBe(false);
    expect(wrapper.get('.session-poster').element.tagName).toBe('BUTTON');
  });
});

describe('SessionDetail - identifiant', () => {
  it('copie l’identifiant de la session', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const wrapper = factory({ title: 'Film', session_id: 'abc123def456' });
    await wrapper.get('.copy-id').trigger('click');
    expect(writeText).toHaveBeenCalledWith('abc123def456');
  });

  it('pas de bouton sans identifiant', () => {
    expect(factory({ title: 'Film' }).find('.copy-id').exists()).toBe(false);
  });
});

describe('SessionDetail - chiffrement et relais', () => {
  it('indique une connexion chiffrée ou non dans la ligne d’identité', () => {
    expect(factory({ title: 'Film', stream_details: { secure: true } }).get('.session-secure').text()).toBe('Chiffrée');
    const insecure = factory({ title: 'Film', stream_details: { secure: false } }).get('.session-secure');
    expect(insecure.text()).toBe('Non chiffrée');
    expect(insecure.classes()).toContain('insecure');
    expect(factory({ title: 'Film' }).find('.session-secure').exists()).toBe(false);
  });
});

