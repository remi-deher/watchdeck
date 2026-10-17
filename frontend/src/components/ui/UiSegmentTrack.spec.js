import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiSegmentTrack from './UiSegmentTrack.vue';

describe('UiSegmentTrack', () => {
  const segments = [
    { key: 'a', size: 30, tone: 'success', label: 'Premier' },
    { key: 'b', size: 0, tone: 'neutral', label: 'Vide', class: 'extra' },
    { key: 'c', size: 70, tone: 'warning', label: 'Dernier', live: true },
  ];

  it('répartit les segments sur le total, avec ton, classes et pulsation', () => {
    const wrapper = mount(UiSegmentTrack, { props: { segments, total: 100, progress: 42, ticks: ['0', '50', '100'] } });

    const items = wrapper.findAll('.timeline-segment');
    expect(items).toHaveLength(3);
    expect(items[0].attributes('style')).toContain('width: 30%');
    // Un segment vide reste visible : la largeur minimale s'applique.
    expect(items[1].attributes('style')).toContain('width: 0.8%');
    expect(items[1].classes()).toEqual(expect.arrayContaining(['tone-neutral', 'extra']));
    expect(items[2].classes()).toContain('is-live');
    expect(items[2].find('.live-pulse').exists()).toBe(true);
    expect(items[0].attributes('title')).toBe('Premier');
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('42');
    expect(wrapper.findAll('.timeline-ticks span').map((tick) => tick.text())).toEqual(['0', '50', '100']);
    expect(wrapper.find('.timeline-legend').exists()).toBe(false);
  });

  it('émet la sélection au clic et au clavier, et marque le segment choisi', async () => {
    const wrapper = mount(UiSegmentTrack, { props: { segments, total: 100, selected: 2 } });
    const items = wrapper.findAll('.timeline-segment');
    expect(items[2].classes()).toContain('is-selected');

    await items[0].trigger('click');
    await items[1].trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')).toEqual([[0], [1]]);
  });

  it('affiche la légende avec les mêmes tons', () => {
    const wrapper = mount(UiSegmentTrack, {
      props: { segments, total: 100, legend: [{ key: 'ok', label: 'Lecture (1 min)', tone: 'success' }] },
    });
    const item = wrapper.find('.legend-item');
    expect(item.text()).toBe('Lecture (1 min)');
    expect(item.find('.legend-dot').classes()).toContain('tone-success');
  });
});
