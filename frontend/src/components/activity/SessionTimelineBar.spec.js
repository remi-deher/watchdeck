import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SessionTimelineBar from './SessionTimelineBar.vue';

describe('SessionTimelineBar', () => {
  const sampleSession = {
    duration_ms: 7200000,
    progress_ms: 3000000,
    state: 'playing',
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
        ended_at: null,
        duration_ms: 1800000,
        view_offset_start_ms: 1200000,
        view_offset_end_ms: 3000000,
      },
    ],
  };

  it('affiche les segments multiples avec leurs styles, légende, ratio et repères', () => {
    const wrapper = mount(SessionTimelineBar, {
      props: { session: sampleSession },
    });

    expect(wrapper.text()).toContain('Timeline de lecture');
    expect(wrapper.text()).toContain('3 segments');
    expect(wrapper.text()).toContain('77% actif'); // 50 min play / 65 min total = 76.9% -> 77%
    expect(wrapper.findAll('.timeline-segment')).toHaveLength(3);

    // Vérifie les classes des segments
    const segments = wrapper.findAll('.timeline-segment');
    expect(segments[0].classes()).toContain('seg-playing');
    expect(segments[0].classes()).toContain('method-direct_play');
    expect(segments[1].classes()).toContain('seg-paused');
    expect(segments[2].classes()).toContain('seg-playing');
    expect(segments[2].classes()).toContain('method-transcode');

    // Vérifie le pulse sur le segment actif en cours
    expect(segments[2].classes()).toContain('is-live');
    expect(segments[2].find('.live-pulse').exists()).toBe(true);

    // Vérifie les repères temporels sous la barre
    expect(wrapper.find('.timeline-ticks').text()).toContain('0:00');
    expect(wrapper.find('.timeline-ticks').text()).toContain('2 h 0 min');

    // Vérifie la légende
    expect(wrapper.text()).toContain('Lecture directe (20 min)');
    expect(wrapper.text()).toContain('Transcodage (30 min)');
    expect(wrapper.text()).toContain('Pause (15 min)');
  });

  it('déplie le journal des événements au clic sur le bouton toggle', async () => {
    const wrapper = mount(SessionTimelineBar, {
      props: { session: sampleSession },
    });

    // Initialement fermé
    expect(wrapper.find('.segments-log-drawer').exists()).toBe(false);

    // Clic sur le bouton de toggle
    await wrapper.find('.timeline-toggle-btn').trigger('click');

    expect(wrapper.find('.segments-log-drawer').exists()).toBe(true);
    expect(wrapper.text()).toContain('Journal des événements');
    expect(wrapper.text()).toContain('1 pause (15 min)');

    const rows = wrapper.findAll('.segment-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].text()).toContain('Lecture directe');
    expect(rows[0].text()).toContain('20 min');
    expect(rows[0].text()).toContain('Position : 0 min → 20 min');
    expect(rows[1].text()).toContain('Pause');
    expect(rows[1].text()).toContain('15 min');
    expect(rows[2].text()).toContain('Lecture (Transcodage)');
    expect(rows[2].text()).toContain('30 min');
  });

  it('déplie le journal et surligne la ligne au clic sur un segment de la barre', async () => {
    const wrapper = mount(SessionTimelineBar, {
      props: { session: sampleSession },
    });

    const segments = wrapper.findAll('.timeline-segment');
    await segments[1].trigger('click'); // Clic sur le segment pause

    expect(wrapper.find('.segments-log-drawer').exists()).toBe(true);
    expect(segments[1].classes()).toContain('is-selected');

    const rows = wrapper.findAll('.segment-row');
    expect(rows[1].classes()).toContain('row-highlighted');
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
