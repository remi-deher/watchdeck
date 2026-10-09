import { flushPromises, mount } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EncodingOverviewView from './EncodingOverviewView.vue';
import EncodingQueueView from './EncodingQueueView.vue';
import EncodingHistoryView from './EncodingHistoryView.vue';
import EncodingStatsView from './EncodingStatsView.vue';
import EncodingSettingsView from './EncodingSettingsView.vue';
import EncodingLibrariesView from './EncodingLibrariesView.vue';
import EncodingFlowsView from './EncodingFlowsView.vue';

/* Les pages Encodage sur leurs gabarits, avec un FileFlows simule. */
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/api', () => ({ api: request }));
vi.mock('@/events', () => ({ useRealtime: vi.fn() }));

const media = { id: 7, title: 'Anaconda', year: 1997, media_type: 'movie' };
const STATUS = {
  configured: true,
  connected: true,
  queue: 230,
  processing: 1,
  processed: 172,
  failed: 1,
  runners: [{ path: '/usb2/a.mkv', name: '/usb2/MEDIA/FILMS/Psycho-Pass.mkv', library: 'Films — USB 2', step: '4. Assemblage', percent: 88, media: null }],
  recent_failed: [{ uid: 'f1', name: '/usb3/Anaconda.mkv', library: 'Films — USB 3', status: 4, failure_reason: 'Durée audio différente', media }],
  recent_processed: [{ uid: 'p1', name: '/usb1/Dune.mkv', library: 'Films — USB 1', status: 1, media: null, timing: { processing_seconds: 240 } }],
};
const OVERVIEW = {
  state: { queue: 230, processing: 1, processed: 172, failed: 1, paused: false, paused_until: null },
  disks: [
    { disk: 'usb2', libraries: ['Films — USB 2'], waiting: 56, running: [STATUS.runners[0]], lock_waiting: 3, plex_paused: false, plex_playing: false },
    { disk: 'usb1', libraries: ['Films — USB 1'], waiting: 170, running: [], lock_waiting: 0, plex_paused: true, plex_playing: true },
  ],
  throughput: { per_hour: 6, window_minutes: 60 },
  eta_hours: 38,
  automations: { reorder: true, plex_pause: 'disk', runners_mode: 'manual' },
};
const NOW = new Date().toISOString();
const PASSES = [
  { id: 1, file_uid: 'f1', status: 'failed', kind: null, path: '/usb3/Anaconda.mkv', library: 'Films — USB 3', disk: 'usb3', flow: 'V3', library_item_id: 7, ended_at: NOW, processing_seconds: 120, wait_seconds: 0, original_size: 8_000_000_000, final_size: null, failure_reason: 'Durée audio différente', before: { video: { codec: 'h264' } }, after: null },
  { id: 2, file_uid: 'p1', status: 'processed', kind: 'encode', path: '/usb1/Dune.mkv', library: 'Films — USB 1', disk: 'usb1', flow: 'V3', library_item_id: null, ended_at: NOW, processing_seconds: 240, wait_seconds: 0, original_size: 9_000_000_000, final_size: 5_000_000_000, failure_reason: null, before: { video: { codec: 'h264' } }, after: { video: { codec: 'hevc' } } },
];
const STATS = { days: 30, processed: 142, failed: 3, saved_bytes: 212_000_000_000, average_seconds: 300, per_day: [{ day: NOW.slice(0, 10), processed: 10, failed: 1 }], kinds: { encode: 100, rewrite: 42 }, disks: [{ disk: 'usb1', count: 90, average_seconds: 280, average_wait_seconds: 0 }], steps: [{ name: '3. Vidéo', count: 100, average_seconds: 200 }] };
const CONTROL = { runners_mode: 'manual', runners: 4, max_runners: 5, plex_pause: 'disk', plex_pause_relaunched: 'follow', plex_resume_minutes: 5, reorder_enabled: true, schedule_restricted: false, schedule_preset: 'always', alert_channels: ['ntfy'], channels_ready: { email: true, discord: false, telegram: false, ntfy: true, gotify: false }, guard: null };
const LIBRARIES = {
  libraries: [{ uid: 'l1', name: 'Films — USB 2', path: '/usb2/MEDIA/FILMS', disk: 'usb2', enabled: true, flow: { uid: 'v3', name: 'Flow V3' }, waiting: 56, last_scanned: null, reorder: true, plex_location: '/usb2/MEDIA/FILMS', plex_location_confirmed: true, plex_location_suggested: null, shared_disk: false }],
  flows: [{ uid: 'v3', name: 'Flow V3', used_by: ['Films — USB 2'] }],
  plex_locations: [],
};
const FLOWS = { flows: [{ uid: 'v3', name: 'Flow V3', description: '', revision: 10, modified: null, steps: ['0. Verrou du disque', '1. Sous-titres'], used_by: ['Films — USB 2'] }, { uid: 'old', name: 'Ancien', description: '', revision: 1, modified: null, steps: [], used_by: [] }] };

function respond(path) {
  if (path.startsWith('/api/fileflows/status')) return STATUS;
  if (path.startsWith('/api/fileflows/overview')) return OVERVIEW;
  if (path.startsWith('/api/fileflows/control')) return CONTROL;
  if (path.startsWith('/api/fileflows/libraries')) return LIBRARIES;
  if (path.startsWith('/api/fileflows/flows')) return FLOWS;
  if (path.startsWith('/api/fileflows/history')) return { stats: STATS, recent: PASSES };
  if (path.startsWith('/api/fileflows/files?status=0')) return { files: [{ uid: 'q1', name: '/usb1/Lilo.mkv', library: 'Films — USB 1', status: 0, relaunched: true }, { uid: 'q2', name: '/usb3/Heat.mkv', library: 'Films — USB 3', status: 0 }], has_more: false };
  if (path.startsWith('/api/fileflows/files?status=4')) return { files: [STATUS.recent_failed[0]], has_more: false };
  return {};
}

async function mountAt(path, component) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
  await router.push(path);
  const wrapper = mount(component, { global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } });
  for (let i = 0; i < 5; i += 1) await flushPromises();
  return wrapper;
}

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path) => respond(path));
});

describe('Encodage sur les gabarits', { timeout: 20_000 }, () => {
  it('la vue d’ensemble surveille : échec et disque retenu en attention, disques en parties', async () => {
    const wrapper = await mountAt('/encoding', EncodingOverviewView);
    expect(wrapper.find('.monitor').exists()).toBe(true);
    const todo = wrapper.find('.overview-todo').text();
    expect(todo).toContain('Anaconda (1997) a échoué');
    expect(todo).toContain('usb2 retient 3 runners');
    expect(wrapper.find('.zone-map').text()).toContain('En pause : lecture Plex');
  });

  it('la file suit : échec bloqué, runner en cours, attente dans l’ordre', async () => {
    const wrapper = await mountAt('/encoding/queue', EncodingQueueView);
    expect(wrapper.findAll('.track__group h2').map((n) => n.text())).toEqual(['Demande une intervention', 'En cours', 'En attente']);
    expect(wrapper.find('.track__group.is-blocked').text()).toContain('Durée audio différente');
    expect(wrapper.find('.track__group.is-running').text()).toContain('88 %');
    expect(wrapper.find('.track-queue').text()).toContain('relancé à la main');
  });

  it('l’historique raconte les passages et ouvre leur détail', async () => {
    const wrapper = await mountAt('/encoding/history', EncodingHistoryView);
    expect(wrapper.findAll('.understand-row strong').map((n) => n.text())).toEqual(['Anaconda.mkv', 'Dune.mkv']);
    expect(wrapper.find('.understand__summary').text()).toContain('142 traités');
    await wrapper.find('.understand-row').trigger('click');
    await flushPromises();
    expect(wrapper.find('.understand-detail').text()).toContain('Durée audio différente');
  });

  it('les statistiques comparent à la période précédente', async () => {
    const wrapper = await mountAt('/encoding/stats', EncodingStatsView);
    expect(wrapper.find('.analyze').exists()).toBe(true);
    expect(wrapper.text()).toContain('Place gagnée');
    expect(request.mock.calls.some(([path]) => path.includes('offset=30'))).toBe(true);
  });

  it('les réglages, bibliothèques et flows passent par Configurer', async () => {
    const settings = await mountAt('/encoding/settings', EncodingSettingsView);
    expect(settings.findAll('.configure__section h2').map((n) => n.text())).toEqual(['Runners', 'Pendant une lecture Plex', 'File d’attente', 'Alertes', 'Plages horaires']);
    const libraries = await mountAt('/encoding/libraries', EncodingLibrariesView);
    expect(libraries.find('.resource').text()).toContain('Films — USB 2');
    expect(libraries.find('.resource').text()).toContain('Correspondance Plex');
    const flows = await mountAt('/encoding/flows', EncodingFlowsView);
    expect(flows.findAll('.configure__section h2').map((n) => n.text())).toEqual(['Flows utilisés', 'Flows inutilisés']);
  });
});
