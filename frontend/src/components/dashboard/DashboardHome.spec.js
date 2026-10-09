import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createQueryClient } from '@/queryClient';

import DashboardActionCenter from './DashboardActionCenter.vue';
import DashboardGreeting from './DashboardGreeting.vue';
import DashboardLiveStrip from './DashboardLiveStrip.vue';
import DashboardVfUpgradesPanel from './DashboardVfUpgradesPanel.vue';
import ServiceHealthPanel from './ServiceHealthPanel.vue';
import { attentionTotal, blockedQueueRows } from './dashboardAttention';

const apiMock = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => apiMock(...args) }));
vi.mock('@/events', () => ({ useRealtime: vi.fn() }));

const global = { stubs: { RouterLink: RouterLinkStub } };

describe('dashboardAttention', () => {
  it('compte les telechargements bloques et les echecs', () => {
    const queue = [{ status: 'downloading' }, { tracked_state: 'importPending' }, { error: 'disque plein' }];
    expect(blockedQueueRows(queue)).toHaveLength(2);
    expect(attentionTotal(queue, 1)).toBe(3);
  });
});

describe('DashboardGreeting', () => {
  it('salue selon l heure et annonce le nombre d elements a traiter', () => {
    const evening = new Date(2026, 8, 29, 21, 0).getTime();
    const wrapper = mount(DashboardGreeting, { props: { name: 'Rémi', attentionCount: 3, now: evening }, global });
    expect(wrapper.text()).toContain('Bonsoir, Rémi');
    expect(wrapper.text()).toContain('3 éléments demandent votre attention');
    expect(wrapper.text()).toContain('Mardi 29 septembre');
  });

  it('dit quand rien n est a traiter', () => {
    const morning = new Date(2026, 8, 29, 9, 0).getTime();
    const wrapper = mount(DashboardGreeting, { props: { now: morning }, global });
    expect(wrapper.text()).toContain('Bonjour');
    expect(wrapper.text()).toContain('Aucune intervention nécessaire');
  });
});

describe('DashboardActionCenter', () => {
  it('liste les imports bloques et les echecs, ou dit qu il n y a rien', () => {
    const calm = mount(DashboardActionCenter, { global });
    expect(calm.text()).not.toContain('Demandes à valider');
    expect(calm.text()).toContain('Rien à signaler');

    const busy = mount(DashboardActionCenter, {
      props: { queue: [{ id: 1, title: 'The Bear', tracked_state: 'importPending' }], failedCount: 2 },
      global,
    });
    expect(busy.text()).toContain('The Bear');
    expect(busy.text()).toContain('Téléchargé, pas encore importé');
    expect(busy.text()).toContain('2 demandes en échec');
    expect(busy.text()).toContain('1 bloqué · 2 échecs');
  });
});

describe('DashboardLiveStrip', () => {
  it('ne présente pas un chargement ou une panne comme une absence de lecture', async () => {
    const wrapper = mount(DashboardLiveStrip, { props: { loading: true }, global });
    expect(wrapper.text()).toContain('Récupération des lectures Plex');
    expect(wrapper.text()).not.toContain('Aucune lecture en cours');
    await wrapper.setProps({ loading: false, failed: true });
    expect(wrapper.text()).toContain('momentanément indisponibles');
    expect(wrapper.text()).not.toContain('Aucune lecture en cours');
    await wrapper.setProps({ failed: false });
    expect(wrapper.text()).toContain('Aucune lecture en cours');
  });

  it('resume les lectures et emet la lecture choisie', async () => {
    const sessions = [
      { session_id: 1, title: 'Severance', grandparent_title: 'Severance', season_number: 2, episode_number: 7, user_name: 'Léa', playback_method: 'direct_play', bandwidth_kbps: 20000, state: 'playing' },
      { session_id: 2, title: 'Monte-Cristo', user_name: 'Thomas', playback_method: 'transcode', state: 'paused' },
    ];
    const wrapper = mount(DashboardLiveStrip, { props: { sessions }, global });
    expect(wrapper.text()).toContain('2 lectures');
    expect(wrapper.text()).toContain('Severance · S2 · É7');
    expect(wrapper.text()).toContain('En pause');
    await wrapper.findAll('.live-card')[1].trigger('click');
    expect(wrapper.emitted('select')[0][0]).toStrictEqual(sessions[1]);
  });

  it('detaille la qualite, le son, le reseau et la raison du transcodage', () => {
    const sessions = [{
      session_id: 3, title: 'Dune', user_name: 'Rémi', player: 'Apple TV', playback_method: 'transcode', state: 'playing',
      progress_ms: 60_000, duration_ms: 600_000, geo_city: 'Lyon',
      transcode_reason: { source: 'deduced', text: 'Codec HEVC non lu par le lecteur' },
      stream_details: {
        dynamic_range: { source: 'HDR10', output: 'SDR' },
        tracks: {
          video: { decision: 'transcode', from: { width: 3840, height: 1600 }, to: { height: 1080 } },
          audio: { from: { channels: 8, language: 'Français' } },
          subtitles: { languages: [{ language: 'English', selected: true }] },
        },
      },
    }];
    const wrapper = mount(DashboardLiveStrip, { props: { sessions }, global });
    const chips = wrapper.findAll('.live-chip').map((chip) => chip.text());
    // Quatre faits au plus, chacun avec son icone ; le reste en « +N », detaille au survol.
    expect(chips).toEqual(['4K → 1080p', 'HDR10 → SDR', '7.1 · FR', 'ST EN', '+1']);
    expect(wrapper.find('.live-chip-more').attributes('title')).toBe('Distant · Lyon');
    expect(wrapper.findAll('.live-chip-icon')).toHaveLength(4);
    expect(wrapper.find('.live-card-reason').text()).toBe('Codec HEVC non lu par le lecteur');
    expect(wrapper.find('.live-card-who').text()).toBe('Rémi · Apple TV');
    expect(wrapper.text()).toContain('serveur libre vers');
  });

  it('adapte la disposition au nombre de lectures', () => {
    const make = (count) => Array.from({ length: count }, (_, i) => ({ session_id: i + 1, title: `Film ${i + 1}`, state: 'playing' }));
    const list = (count) => mount(DashboardLiveStrip, { props: { sessions: make(count) }, global }).find('.live-strip-list');
    expect(list(1).classes()).toContain('is-banner');
    expect(list(3).classes()).toContain('is-fanart');
    expect(list(3).attributes('style')).toContain('--live-count: 3');
    expect(list(5).classes()).toContain('is-fanart');
    expect(list(6).classes()).toContain('is-posters');
  });

  it('montre le fond et le logo de l oeuvre en disposition large, le titre sinon', async () => {
    const session = {
      session_id: 'a', title: 'Le pilote', grandparent_title: 'Bref', season_number: 1, episode_number: 3, state: 'playing',
      thumb_url: '/api/playback/thumb?path=%2Fposter', art_url: '/api/playback/thumb?path=%2Fart', logo_url: '/api/playback/thumb?path=%2Flogo',
    };
    const wrapper = mount(DashboardLiveStrip, { props: { sessions: [session] }, global });
    expect(wrapper.find('.live-backdrop img').attributes('src')).toContain('%2Fart');
    expect(wrapper.find('.live-inset img').attributes('src')).toContain('%2Fposter');
    expect(wrapper.find('.live-logo').attributes('src')).toBe('/api/playback/thumb?path=%2Flogo&width=600');
    expect(wrapper.find('.live-logo-label').text()).toBe('S1 · É3');
    await wrapper.find('.live-logo').trigger('error');
    expect(wrapper.find('.live-logo').exists()).toBe(false);
    expect(wrapper.text()).toContain('Bref · S1 · É3');
  });

  it('tient sur une ligne quand rien ne joue', () => {
    const wrapper = mount(DashboardLiveStrip, { global });
    expect(wrapper.find('.live-strip').classes()).toContain('is-idle');
    expect(wrapper.find('.live-strip-list').exists()).toBe(false);
    expect(wrapper.text()).toContain('Aucune lecture en cours');
  });

  it('signale une collecte desactivee', () => {
    const wrapper = mount(DashboardLiveStrip, { props: { collectionEnabled: false }, global });
    expect(wrapper.text()).toContain('La collecte des lectures en direct est désactivée.');
  });
});

describe('DashboardVfUpgradesPanel', () => {
  beforeEach(() => apiMock.mockReset());

  it('montre les premieres suggestions en attente et les compteurs', async () => {
    apiMock.mockImplementation(async (path) => {
      if (String(path).startsWith('/api/vf-upgrades/dashboard')) {
        return {
          items: [
            { id: 1, scope: 'movie', status: 'pending', release_count: 3, media: { title: 'Civil War', year: 2024 } },
            { id: 2, scope: 'season', season_number: 1, status: 'pending', release_count: 1, media: { title: 'Fallout' } },
            { id: 3, scope: 'movie', status: 'pending', is_ignored: true, media: { title: 'Ignoré' } },
          ],
        };
      }
      if (path === '/api/vf-upgrades/metrics') return { states: { pending: 23 }, accepted: 150, verified: 148, failed: 0 };
      return {};
    });
    const wrapper = mount(DashboardVfUpgradesPanel, {
      global: { ...global, plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]] },
    });
    await flushPromises();

    expect(apiMock.mock.calls[0][0]).toBe('/api/vf-upgrades/dashboard?status=pending&waiting_limit=0');
    expect(wrapper.text()).toContain('Civil War (2024)');
    expect(wrapper.text()).toContain('3 releases trouvées');
    expect(wrapper.text()).toContain('Fallout · Saison 1');
    expect(wrapper.text()).not.toContain('Ignoré');
    // « à traiter » suit la liste filtree (comme la page), pas metrics.states.pending.
    const stats = Object.fromEntries(wrapper.findAll('.vf-stats div').map((tile) => [tile.find('dt').text(), tile.find('dd').text()]));
    expect(stats).toEqual({ 'à traiter': '2', 'en cours': '2', 'passés en VF': '148', 'en échec': '0' });
  });
});

describe('ServiceHealthPanel', () => {
  beforeEach(() => { apiMock.mockReset(); localStorage.clear(); });

  it('met les pannes en tete avec un lien de correction, et resume l etat', async () => {
    apiMock.mockResolvedValue({
      status: 'degraded',
      checked_at: new Date().toISOString(),
      services: {
        sonarr: { ok: true, state: 'ok', message: 'OK', response_ms: 42.3 },
        radarr: { ok: true, state: 'ok', message: 'OK', response_ms: 1520 },
        prowlarr: { ok: false, state: 'error', message: 'Connexion impossible', action_url: '/settings#tab-connexions' },
        seer: { ok: null, state: 'disabled', message: 'Demandes via Seer desactivees', action_url: '/settings#tab-connexions', action_label: 'Activer' },
        plex: { ok: true, state: 'ok', message: 'OK', response_ms: 120 },
        smtp: { ok: true, state: 'ok', message: 'Configure' },
        rss: { ok: null, state: 'non_configured', message: 'Non configure', action_url: '/settings#tab-connexions', action_label: 'Configurer' },
      },
    });
    const wrapper = mount(ServiceHealthPanel, {
      global: { ...global, plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]] },
    });
    await flushPromises();

    const rows = wrapper.findAll('.service-row');
    expect(rows.map((row) => row.find('strong').text())).toEqual(['Prowlarr', 'Plex', 'Sonarr', 'Radarr', 'E-mail', 'Seer', 'Watchlist Plex']);
    expect(rows[0].text()).toContain('Connexion impossible');
    expect(rows[0].text()).toContain('Corriger');
    expect(rows[3].find('.service-row-latency').classes()).toContain('is-slow');
    expect(rows[3].text()).toContain('1,5 s');
    expect(rows[5].text()).toContain('Désactivé');
    expect(rows[6].text()).toContain('Configurer');
    expect(wrapper.find('.service-health-verdict').text()).toBe('1 service en panne');
    expect(wrapper.text()).toContain('Vérifié à l’instant');
  });
});

describe('ServiceHealthPanel details', () => {
  beforeEach(() => { apiMock.mockReset(); localStorage.clear(); });

  it('affiche version, instances, lectures, derniere activite et deplie les alertes', async () => {
    const started = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    apiMock.mockResolvedValue({
      status: 'healthy',
      checked_at: new Date().toISOString(),
      services: {
        plex: { ok: true, state: 'ok', response_ms: 80, version: '1.41.0', instance_name: 'Maison', sessions: 2 },
        sonarr: {
          ok: true, state: 'ok', response_ms: 40, version: '4.0.9.2244', instance_name: 'Sonarr', instances: 2, started_at: started,
          issues: [{ level: 'error', message: 'Dossier racine manquant' }, { level: 'warning', message: 'Indexer lent' }], issue_count: 3,
        },
        radarr: { ok: true, state: 'ok', response_ms: 30 },
        seer: { ok: true, state: 'ok', response_ms: 50, version: '2.1.0', update_available: true },
        smtp: { ok: true, state: 'ok', providers: ['Brevo'], last_activity_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
        rss: { ok: true, state: 'ok', items: 12, last_activity_at: new Date().toISOString() },
      },
    });
    const wrapper = mount(ServiceHealthPanel, {
      global: { ...global, plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]] },
    });
    await flushPromises();

    const byName = Object.fromEntries(wrapper.findAll('.service-row').map((row) => [row.find('strong').text(), row]));
    expect(wrapper.findAll('.service-row')[0].find('strong').text()).toBe('Sonarr');
    expect(byName.Sonarr.find('.service-row-facts').text()).toBe('v4.0.9 · 2 instances · actif depuis 3 j');
    expect(byName.Sonarr.find('small').exists()).toBe(false);
    expect(byName.Plex.text()).toContain('Maison');
    expect(byName.Plex.find('.service-row-facts').text()).toBe('v1.41.0 · 2 lectures en cours');
    expect(byName.Seer.text()).toContain('Mise à jour disponible');
    expect(byName['E-mail'].find('.service-row-facts').text()).toBe('Brevo · dernier envoi il y a 2 h');
    expect(byName['Watchlist Plex'].find('.service-row-facts').text()).toBe('relevée à l\'instant · 12 éléments');
    expect(byName.Radarr.find('.service-row-facts').text()).toBe('Opérationnel');
    expect(wrapper.find('.service-health-verdict').text()).toBe('1 service à surveiller');

    const toggle = byName.Sonarr.find('.service-row-issues-toggle');
    expect(toggle.text()).toBe('3 alertes');
    expect(byName.Sonarr.find('.service-row-issues').exists()).toBe(false);
    await toggle.trigger('click');
    const issues = wrapper.findAll('.service-row-issues li').map((li) => li.text());
    expect(issues).toEqual(['Dossier racine manquant', 'Indexer lent', 'et 1 autre dans Sonarr']);
    expect(toggle.attributes('aria-expanded')).toBe('true');
  });
});
