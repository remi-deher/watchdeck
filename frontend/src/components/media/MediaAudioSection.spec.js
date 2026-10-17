import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaAudioSection from './MediaAudioSection.vue';

const global = {
  stubs: {
    AlignStreamsModal: true,
    VfUpgradeButton: true,
    UiTooltip: { props: ['text'], template: '<span class="tooltip-stub" :title="text"><slot /></span>' },
    UiCollapsible: { template: '<div class="collapsible-stub"><slot name="trigger" /><slot /></div>' },
  },
};

describe('MediaAudioSection', () => {
  it('liste les pistes d’un film et ses alertes de sous-titres', () => {
    const wrapper = mount(MediaAudioSection, {
      props: {
        vfDetail: {
          media_type: 'movie',
          tracks: [{ lang: 'eng', label: 'English 5.1', is_default: true, is_fr: false }],
          subtitles: [{ lang: 'fre', label: 'Français', is_fr: true, is_default: false }],
        },
      },
      global,
    });

    expect(wrapper.text()).toContain('Audio (1)');
    expect(wrapper.text()).toContain('Sous-titres (1)');
    expect(wrapper.text()).toContain('English 5.1');
    const alert = wrapper.find('.subtitle-alerts .badge');
    expect(alert.text()).toBe('Sous-titre FR non activé');
    expect(alert.classes()).toContain('pending');
  });

  it('montre les compteurs de saison et déplie le détail d’un épisode', async () => {
    const wrapper = mount(MediaAudioSection, {
      props: {
        vfDetail: {
          media_type: 'show',
          seasons: [{
            season_number: 1,
            name: 'Saison 1',
            open: true,
            counts: { vf: 1, sub_fr_absent: 2 },
            episodes: [{ episode: 3, title: 'Pilote', status: 'vf', tracks: [{ label: 'Français', is_fr: true }], subtitles: [] }],
          }],
        },
      },
      global,
    });

    expect(wrapper.text()).toContain('Saison 1');
    expect(wrapper.text()).toContain('Sub FR absent: 2');
    expect(wrapper.text()).toContain('3. Pilote');
    expect(wrapper.find('.episode-status-btn').classes()).toContain('available');
    expect(wrapper.text()).not.toContain('Langues audio');

    await wrapper.find('.media-episode-row').trigger('click');
    expect(wrapper.text()).toContain('Langues audio');
    expect(wrapper.text()).toContain('Sous-titres OK');
  });
});
