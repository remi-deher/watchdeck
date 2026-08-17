import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SessionTimelineBar from './SessionTimelineBar.vue';

describe('SessionTimelineBar', () => {
  it('affiche les segments multiples avec leurs styles et légendes', () => {
    const session = {
      duration_ms: 7200000,
      progress_ms: 3000000,
      segments: [
        {
          id: 1,
          state: 'playing',
          playback_method: 'direct_play',
          started_at: '2026-08-18T20:00:00',
          ended_at: '2026-08-18T20:20:00',
          duration_ms: 1200000,
          view_offset_start_ms: 0,
          view_offset_end_ms: 1200000,
        },
        {
          id: 2,
          state: 'paused',
          started_at: '2026-08-18T20:20:00',
          ended_at: '2026-08-18T20:35:00',
          duration_ms: 900000,
          view_offset_start_ms: 1200000,
          view_offset_end_ms: 1200000,
        },
        {
          id: 3,
          state: 'playing',
          playback_method: 'transcode',
          started_at: '2026-08-18T20:35:00',
          ended_at: '2026-08-18T21:05:00',
          duration_ms: 1800000,
          view_offset_start_ms: 1200000,
          view_offset_end_ms: 3000000,
        },
      ],
    };

    const wrapper = mount(SessionTimelineBar, {
      props: { session },
    });

    expect(wrapper.text()).toContain('Timeline de lecture');
    expect(wrapper.text()).toContain('3 segments');
    expect(wrapper.findAll('.timeline-segment')).toHaveLength(3);

    // Vérifie les classes des segments
    const segments = wrapper.findAll('.timeline-segment');
    expect(segments[0].classes()).toContain('seg-playing');
    expect(segments[0].classes()).toContain('method-direct_play');
    expect(segments[1].classes()).toContain('seg-paused');
    expect(segments[2].classes()).toContain('seg-playing');
    expect(segments[2].classes()).toContain('method-transcode');

    // Vérifie la légende
    expect(wrapper.text()).toContain('Lecture directe (20 min)');
    expect(wrapper.text()).toContain('Transcodage (30 min)');
    expect(wrapper.text()).toContain('Pause (15 min)');
  });

  it('gère le repli quand aucun segment détaillé n’est présent', () => {
    const session = {
      duration_ms: 3600000,
      progress_ms: 1800000,
      state: 'playing',
      playback_method: 'direct_play',
      segments: [],
    };

    const wrapper = mount(SessionTimelineBar, {
      props: { session },
    });

    expect(wrapper.text()).toContain('Timeline de lecture');
    expect(wrapper.findAll('.timeline-segment')).toHaveLength(1);
    expect(wrapper.text()).toContain('Lecture directe (30 min)');
  });
});
