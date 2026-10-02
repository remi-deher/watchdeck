import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PieChart from './PieChart.vue';
import SparklineChart from './SparklineChart.vue';

describe('SparklineChart', () => {
  it('rend un canvas Chart.js quand il y a plus d’un point', () => {
    const wrapper = mount(SparklineChart, { props: { points: [10, 20, 15, 35, 25] } });
    expect(wrapper.find('canvas').exists()).toBe(true);
    expect(wrapper.find('canvas').attributes('data-points')).toBe('5');
    expect(wrapper.find('svg').exists()).toBe(false);
  });

  it('affiche un repli vide quand la liste de points est insuffisante', () => {
    const wrapper = mount(SparklineChart, { props: { points: [10] } });
    expect(wrapper.find('canvas').exists()).toBe(false);
    expect(wrapper.find('.sparkline-empty').exists()).toBe(true);
  });
});

describe('PieChart', () => {
  const items = [{ label: 'Films', value: 3 }, { label: 'Séries', value: 1 }];

  it('rend un doughnut Chart.js et sa légende HTML', () => {
    const wrapper = mount(PieChart, { props: { items } });
    expect(wrapper.find('canvas').attributes('data-points')).toBe('2');
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.text()).toContain('75.0 %');
  });

  it('conserve la sélection accessible depuis la légende', async () => {
    const wrapper = mount(PieChart, { props: { items, interactive: true } });
    await wrapper.findAll('.pie-legend button')[0].trigger('click');
    expect(wrapper.emitted('select')[0][0].label).toBe('Films');
  });
});
