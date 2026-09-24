import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MediaRowsTable from './MediaRowsTable.vue';
import AnalyticsItemDetail from './AnalyticsItemDetail.vue';

const push = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/analytics?tab=table' }),
  useRouter: () => ({ push, resolve: (to) => ({ path: String(to), query: {}, hash: '' }) }),
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
    expect(wrapper.text()).toContain('4k');
    expect(wrapper.text()).toContain('hevc');
  });

  it('ouvre la fiche du fichier dans la feuille au clic sur une ligne', async () => {
    const wrapper = factory();
    await wrapper.find('tbody tr').trigger('click');
    const target = push.mock.calls.at(-1)[0];
    expect(target.path).toBe('/analytics/item/1');
    expect(target.state.__overlayBackground).toBe('/analytics?tab=table');
  });

  it('la fiche detaille le media, le fichier et son audience', () => {
    const wrapper = mount(AnalyticsItemDetail, { props: { item: items[0] } });
    expect(wrapper.text()).toContain('Apple');
    expect(wrapper.text()).toContain('Rémi');
    expect(wrapper.text()).toContain('mkv');
  });

  it('expose openColumnPicker pour le bouton de personnalisation de la page', async () => {
    const wrapper = factory();
    await wrapper.vm.openColumnPicker();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Personnaliser les colonnes');
  });
});
