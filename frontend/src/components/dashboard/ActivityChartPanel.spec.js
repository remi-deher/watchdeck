import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ActivityChartPanel from './ActivityChartPanel.vue';

describe('ActivityChartPanel', () => {
  const timeline = {
    labels: ['2026-08-14', '2026-08-15'],
    values: [2, 3],
    series: { requests: [2, 3], availability: [1, 2], notifications: [4, 1] },
  };

  it('conserve ses controles et ses insights dans le panneau commun', async () => {
    const wrapper = mount(ActivityChartPanel, { props: { timeline } });
    expect(wrapper.find('.panel-card').exists()).toBe(true);
    expect(wrapper.find('h2').text()).toContain('30 jours');
    expect(wrapper.find('.activity-insights-col').exists()).toBe(true);
    expect(wrapper.text()).toContain('Demandes reçues');

    const sevenDays = wrapper.findAll('.activity-period button')[0];
    expect(sevenDays.attributes('type')).toBe('button');
    expect(sevenDays.attributes('aria-pressed')).toBe('false');
    await sevenDays.trigger('click');
    expect(wrapper.find('h2').text()).toContain('7 jours');
    expect(sevenDays.attributes('aria-pressed')).toBe('true');
  });
});
