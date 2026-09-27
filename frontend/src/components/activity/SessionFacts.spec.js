import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SessionFacts from './SessionFacts.vue';

const base = {
  state: 'playing',
  quality: '1080p',
  progress_ms: 900_000,
  duration_ms: 6_720_000,
  initial_progress_ms: 1_209_600,
  group_count: 2,
  player: 'Opera',
  platform: 'Opera',
  product: 'Plex Web',
  user_name: 'remi',
  library: 'Films',
  address: '5.51.148.115',
  geo_city: 'Fleurey-sur-Ouche',
  geo_country_code: 'FR',
  geo_isp: 'Free SAS',
  location: 'wan',
  started_at: '2026-09-27T11:19:00Z',
  last_seen_at: '2026-09-27T11:27:00Z',
  paused_ms: 120_000,
  source: 'plex',
  session_id: 'xnn6cgmgs1d07ctavxsat6er',
  stream_details: {
    secure: true,
    relayed: false,
    player: { product: 'Plex Web', version: '4.160.0', platform: 'Opera', platform_version: '135.0', model: 'standalone' },
  },
};

const card = (wrapper, title) => wrapper.findAll('.facts-card').find((c) => c.get('h3').text() === title).text();

describe('SessionFacts', () => {
  it('range les détails en trois cartes : le réseau est sous la carte de localisation', () => {
    const wrapper = mount(SessionFacts, { props: { session: base } });
    expect(wrapper.findAll('.facts-card h3').map((h) => h.text())).toEqual(['Lecture', 'Lecteur', 'Chronologie']);
  });

  it('ajoute la reprise et les séances', () => {
    const wrapper = mount(SessionFacts, { props: { session: base } });
    expect(card(wrapper, 'Lecture')).toContain('depuis 18 %');
    expect(card(wrapper, 'Lecture')).toContain('2e séance');
  });

  it('masque le modèle « standalone » et ne répète pas le navigateur', () => {
    const lecteur = card(mount(SessionFacts, { props: { session: base } }), 'Lecteur');
    expect(lecteur).toContain('Plex Web 4.160.0');
    expect(lecteur).not.toContain('standalone');
    // « Opera » comme appareil, puis « Opera 135.0 » comme système : plus trois fois.
    expect(lecteur.match(/Opera/g)).toHaveLength(2);
  });

  it('tronque l’identifiant et nomme qui a enregistré la session', () => {
    const chrono = card(mount(SessionFacts, { props: { session: base } }), 'Chronologie');
    expect(chrono).toContain('Identifiant de session Plex');
    expect(chrono).toContain('xnn6cgm…t6er');
    expect(chrono).toContain('Enregistré parPlex');
  });
});
