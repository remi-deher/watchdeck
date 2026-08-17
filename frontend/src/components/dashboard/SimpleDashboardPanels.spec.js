import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DiskSpacePanel from './DiskSpacePanel.vue';
import RequestsBreakdownPanel from './RequestsBreakdownPanel.vue';

describe('simple dashboard panels', () => {
  it('rend le stockage dans le panneau commun et gere son etat vide', () => {
    const empty = mount(DiskSpacePanel);
    expect(empty.find('.panel-card').exists()).toBe(true);
    expect(empty.find('.empty').text()).toContain('Aucun disque');

    const filled = mount(DiskSpacePanel, {
      props: { volumes: [{ path: '/media', total_bytes: 100, free_bytes: 25 }] },
    });
    expect(filled.text()).toContain('1 disque(s)');
    expect(filled.find('.volume-chip').exists()).toBe(true);
    expect(filled.find('.empty').exists()).toBe(false);
  });

  it('rend la repartition dans le panneau commun', () => {
    const wrapper = mount(RequestsBreakdownPanel, {
      props: {
        counts: {
          total: 5,
          by_type: { movie: { total: 3 }, show: { total: 2 } },
        },
      },
    });
    expect(wrapper.find('.panel-card').exists()).toBe(true);
    expect(wrapper.find('h2').text()).toContain('Répartition');
    expect(wrapper.findAll('.breakdown-card')).toHaveLength(2);
    expect(wrapper.findAll('.ratio-segment')).toHaveLength(2);
  });
});
