import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConsecutivePlaybacks from './ConsecutivePlaybacks.vue';

const run = [
  { id: '10', method: 'transcode', started_at: '2026-08-03T20:00:00', watched_ms: 1_200_000, label: 'S1 · É1 · Pilote' },
  { id: '11', method: 'direct_play', started_at: '2026-08-03T20:45:00', watched_ms: 0, label: 'S1 · É2 · Suite' },
  { id: '12', method: 'direct_play', started_at: '2026-08-03T21:30:00', watched_ms: 60_000, label: 'S1 · É3 · Fin' },
];

describe('ConsecutivePlaybacks', () => {
  it('situe la lecture dans la série et signale une lecture mixte', () => {
    const wrapper = mount(ConsecutivePlaybacks, { props: { run, currentId: 11 } });
    expect(wrapper.get('.run-head strong').text()).toBe('Lecture 2 sur 3');
    const badge = wrapper.get('.run-head .playback-badge');
    expect(badge.text()).toBe('Mixte');
    const items = wrapper.findAll('.run-list button');
    expect(items).toHaveLength(3);
    expect(items[1].classes()).toContain('current');
    expect(items[1].attributes('aria-current')).toBe('true');
    expect(items[0].get('.playback-badge').text()).toBe('Transcode');
    expect(items[0].text()).toContain('S1 · É1 · Pilote');
  });

  it('passe à la lecture précédente, suivante ou choisie', async () => {
    const wrapper = mount(ConsecutivePlaybacks, { props: { run, currentId: '11' } });
    const [previous, next] = wrapper.findAll('.run-arrows button');
    await previous.trigger('click');
    await next.trigger('click');
    await wrapper.findAll('.run-list button')[2].trigger('click');
    await wrapper.findAll('.run-list button')[1].trigger('click');
    expect(wrapper.emitted('open').map(([id]) => id)).toEqual(['10', '12', '12']);
  });

  it('bloque les flèches aux extrémités et reste masqué hors série', () => {
    const first = mount(ConsecutivePlaybacks, { props: { run, currentId: '10' } });
    expect(first.findAll('.run-arrows button')[0].attributes('disabled')).toBeDefined();
    expect(first.find('.run-head .playback-badge').exists()).toBe(true);
    const same = mount(ConsecutivePlaybacks, { props: { run: run.slice(1), currentId: '12' } });
    expect(same.find('.run-head .playback-badge').exists()).toBe(false);
    expect(same.findAll('.run-arrows button')[1].attributes('disabled')).toBeDefined();
    expect(mount(ConsecutivePlaybacks, { props: { run, currentId: '99' } }).find('nav').exists()).toBe(false);
    expect(mount(ConsecutivePlaybacks, { props: { run: run.slice(0, 1), currentId: '10' } }).find('nav').exists()).toBe(false);
  });
});
