import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createQueryClient } from '@/queryClient';

import DashboardActionCenter from './DashboardActionCenter.vue';
import DashboardGreeting from './DashboardGreeting.vue';
import DashboardLiveStrip from './DashboardLiveStrip.vue';
import DashboardVfUpgradesPanel from './DashboardVfUpgradesPanel.vue';
import { attentionTotal, blockedQueueRows } from './dashboardAttention';

const apiMock = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => apiMock(...args) }));
vi.mock('@/events', () => ({ useRealtime: vi.fn() }));

const global = { stubs: { RouterLink: RouterLinkStub } };

describe('dashboardAttention', () => {
  it('compte les demandes, les telechargements bloques et les echecs', () => {
    const queue = [{ status: 'downloading' }, { tracked_state: 'importPending' }, { error: 'disque plein' }];
    expect(blockedQueueRows(queue)).toHaveLength(2);
    expect(attentionTotal(2, queue, 1)).toBe(5);
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
  it('emet approbation et refus depuis la ligne de la demande', async () => {
    const row = { id: 7, title: 'Dune', media_type: 'movie', year: 2024, plex_user_id: 'abc123', requested_by: 'Léa' };
    const wrapper = mount(DashboardActionCenter, { props: { pending: [row] }, global });
    expect(wrapper.text()).toContain('Film · 2024 · demandé par Léa');
    const buttons = wrapper.findAll('button');
    await buttons.find((b) => b.text().includes('Approuver')).trigger('click');
    await buttons.find((b) => b.text().includes('Refuser')).trigger('click');
    expect(wrapper.emitted('action')).toEqual([[row, 'approve'], [row, 'reject']]);
  });

  it('liste les imports bloques et les echecs, ou dit qu il n y a rien', () => {
    const calm = mount(DashboardActionCenter, { global });
    expect(calm.text()).toContain('Aucune demande en attente.');
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
    expect(wrapper.text()).toContain('23 à traiter');
    expect(wrapper.text()).toContain('2 en cours');
    expect(wrapper.text()).toContain('148 passés en VF');
  });
});
