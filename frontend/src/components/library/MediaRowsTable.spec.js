import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MediaRowsTable from './MediaRowsTable.vue';
import AnalyticsItemDetail from './AnalyticsItemDetail.vue';

const push = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/analytics?tab=table' }),
  useRouter: () => ({
    push,
    resolve: (to) => ({ path: String(to), query: {}, hash: '' }),
    currentRoute: { value: { path: '/analytics/item/1' } },
  }),
}));

const items = [
  {
    rating_key: '1', title: 'Épisode 1', grandparent_title: 'Foundation', media_type: 'episode',
    library: 'Séries', studio: 'Apple', video_resolution: '4k', video_codec: 'hevc',
    audio_codec: 'eac3', audio_languages: ['Français'], audio_track_count: 1,
    subtitle_count: 2, subtitle_types: ['Français · SRT'], size_bytes: 2_000_000_000,
    play_count: 3, viewers: ['Rémi'], container: 'mkv', year: 2025,
    duration_ms: 3_600_000, watch_time_ms: 1_800_000,
  },
];

function factory(props = {}) {
  return mount(MediaRowsTable, { props: { items, ...props } });
}

describe('MediaRowsTable', () => {
  beforeEach(() => { localStorage.clear(); push.mockReset(); });

  it('affiche le titre composite et les caractéristiques du fichier', () => {
    const wrapper = factory();
    expect(wrapper.text()).toContain('Foundation · Épisode 1');
    expect(wrapper.text()).toContain('4K');
    expect(wrapper.text()).toContain('HEVC');
    expect(wrapper.text()).toContain('MKV');
  });

  it('marque la ligne dont la fiche est ouverte', () => {
    const wrapper = factory();
    expect(wrapper.find('tbody tr').classes()).toContain('is-open');
  });

  it('ouvre la fiche du fichier dans la feuille au clic sur une ligne', async () => {
    const wrapper = factory();
    await wrapper.find('tbody tr').trigger('click');
    const target = push.mock.calls.at(-1)[0];
    expect(target.path).toBe('/analytics/item/1');
    expect(target.state.__overlayBackground).toBe('/analytics?tab=table');
    // Les lignes chargees suivent la fiche, pour ses fleches precedent / suivant.
    expect(target.state.__sheetSiblings).toEqual(['1']);
  });

  it('la fiche detaille le media, le fichier et son audience', () => {
    const wrapper = mount(AnalyticsItemDetail, { props: { item: items[0] } });
    expect(wrapper.text()).toContain('Apple');
    expect(wrapper.text()).toContain('Rémi');
    expect(wrapper.text()).toContain('MKV');
    expect(wrapper.text()).toContain('Français · SRT');
  });

  it('la fiche ajoute les details techniques lus dans Plex', () => {
    const technical = {
      file: { path: '/media/Foundation/S01E01.mkv', container: 'mkv', bitrate_kbps: 12000, versions: 1 },
      video: { codec: 'hevc', profile: 'main 10', width: 3840, height: 2160, bit_depth: 10, dynamic_range: 'HDR10', frame_rate: 23.976 },
      audio: [{ language: 'Français', codec: 'eac3', channels: 6, bitrate_kbps: 640, default: true }],
      subtitles: [{ language: 'English', codec: 'srt', forced: true, external: true }],
      library_item_id: null,
    };
    const wrapper = mount(AnalyticsItemDetail, { props: { item: items[0], technical } });
    const text = wrapper.text();
    expect(text).toContain('3840 × 2160 (4K)');
    expect(text).toContain('HDR10');
    expect(text).toContain('10 bits');
    expect(text).toContain('E-AC3 · 5.1 · 640 kb/s');
    expect(text).toContain('SRT · externe · forcé');
    expect(text).toContain('/media/Foundation/S01E01.mkv');
  });

  it('chaque visionnage montre la part vue et son appareil, et ouvre sa session', async () => {
    const item = {
      ...items[0],
      views: [
        { session_id: 12, user: 'Rémi', at: '2026-09-21T20:42:00', watched_ms: 2_700_000, player: 'Salon', platform: 'tvOS' },
        { user: 'Léa', at: '2026-09-20T20:00:00', watched_ms: 3_600_000 },
      ],
    };
    const wrapper = mount(AnalyticsItemDetail, { props: { item }, global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    expect(wrapper.text()).toContain('75 %');
    expect(wrapper.text()).toContain('100 %');
    expect(wrapper.text()).toContain('Salon · tvOS');
    await wrapper.find('a.view-row').trigger('click');
    const target = push.mock.calls.at(-1)[0];
    expect(target.path).toBe('/activity/session/12');
    expect(target.state.__sheetSiblings).toEqual(['12']);
  });

  it("l'affiche ouvre la fiche du media quand la bibliotheque le connait", async () => {
    const wrapper = mount(AnalyticsItemDetail, { props: { item: items[0], technical: { library_item_id: 7 } } });
    await wrapper.find('button.item-poster').trigger('click');
    expect(push.mock.calls.at(-1)[0].path).toBe('/library/media/library/7');
  });

  it('expose openColumnPicker pour le bouton de personnalisation de la page', async () => {
    const wrapper = factory();
    await wrapper.vm.openColumnPicker();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Personnaliser les colonnes');
  });
});
