import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PlaybackMethodBadge from './PlaybackMethodBadge.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

describe('PlaybackMethodBadge', () => {
  it('déduit le mode et sa raison de la session complète', () => {
    const playback = { playback_method: 'transcode', video_decision: 'transcode', transcode_reason: { source: 'deduced', text: 'Codec incompatible' } };
    const w = mount(PlaybackMethodBadge, { props: { playback } });
    expect(w.text()).toBe('Transcodage');
    expect(w.getComponent(UiTooltip).props('text')).toBe('Codec incompatible · Vidéo transcodée');
  });
  it('explique une conversion de conteneur', () => {
    const w = mount(PlaybackMethodBadge, { props: { playback: { playback_method: 'direct_stream', transcode_remux: 'MKV → MP4' } } });
    expect(w.getComponent(UiTooltip).props('text')).toBe('MKV → MP4');
  });
  it('déduit le mode mixte et sa répartition', () => {
    const w = mount(PlaybackMethodBadge, { props: { playbacks: [{ method: 'direct_play' }, { method: 'transcode' }] } });
    expect(w.text()).toBe('Lecture mixte');
    expect(w.getComponent(UiTooltip).props('text')).toContain('1 × transcodage');
  });
  it('rend la même raison dans la note du bandeau', () => {
    const w = mount(PlaybackMethodBadge, { props: { reasonOnly: true, playback: { transcode_reason: { source: 'deduced', text: 'Codec incompatible' } } } });
    expect(w.text()).toBe('Codec incompatible');
  });
});
