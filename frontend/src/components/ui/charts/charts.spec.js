import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BarChart from './BarChart.vue';
import DonutGauge from './DonutGauge.vue';
import HorizontalBarChart from './HorizontalBarChart.vue';
import SparklineChart from './SparklineChart.vue';

describe('SparklineChart', () => {
  it('rend un SVG quand il y a plus d’un point', () => {
    const wrapper = mount(SparklineChart, {
      props: { points: [10, 20, 15, 35, 25] },
    });
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('path').length).toBeGreaterThanOrEqual(1);
    expect(wrapper.find('circle').exists()).toBe(true);
  });

  it('affiche un repli vide quand la liste de points est insuffisante', () => {
    const wrapper = mount(SparklineChart, {
      props: { points: [10] },
    });
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.find('.sparkline-empty').exists()).toBe(true);
  });
});

describe('BarChart', () => {
  const samplePoints = [
    { label: 'Lun', value: 12, detail: '12 lectures' },
    { label: 'Mar', value: 24, detail: '24 lectures' },
    { label: 'Mer', value: 8, detail: '8 lectures' },
  ];

  it('rend les barres avec les hauteurs proportionnelles', () => {
    const wrapper = mount(BarChart, {
      props: { points: samplePoints, unit: 'lectures' },
    });
    const items = wrapper.findAll('.bar-item');
    expect(items.length).toBe(3);
    expect(wrapper.find('.bar-chart-y-axis').exists()).toBe(true);
  });

  it('affiche un tooltip au survol d’une barre', async () => {
    const wrapper = mount(BarChart, {
      props: { points: samplePoints, unit: 'lectures' },
    });
    const firstBar = wrapper.findAll('.bar-item')[0];
    await firstBar.trigger('mouseenter');
    const tooltip = wrapper.find('.bar-tooltip');
    expect(tooltip.exists()).toBe(true);
    expect(tooltip.text()).toContain('12');
  });
});

describe('HorizontalBarChart', () => {
  const items = [
    { label: 'H.264', value: 150 },
    { label: 'HEVC', value: 350 },
    { label: 'AV1', value: 50 },
  ];

  it('calcule les pourcentages et affiche les lignes', () => {
    const wrapper = mount(HorizontalBarChart, {
      props: { items },
    });
    const rows = wrapper.findAll('.hbar-row');
    expect(rows.length).toBe(3);
    expect(wrapper.text()).toContain('H.264');
    expect(wrapper.text()).toContain('HEVC');
  });

  it('émet select au clic quand interactive est vrai', async () => {
    const wrapper = mount(HorizontalBarChart, {
      props: { items, interactive: true },
    });
    const firstRow = wrapper.findAll('.hbar-row')[0];
    await firstRow.trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')[0]).toEqual(['H.264']);
  });
});

describe('DonutGauge', () => {
  it('calcule le pourcentage et affiche le cercle de progression', () => {
    const wrapper = mount(DonutGauge, {
      props: { value: 75, max: 100, label: 'Utilisé' },
    });
    expect(wrapper.text()).toContain('75%');
    expect(wrapper.text()).toContain('Utilisé');
    const circles = wrapper.findAll('circle');
    expect(circles.length).toBe(2);
  });
});
