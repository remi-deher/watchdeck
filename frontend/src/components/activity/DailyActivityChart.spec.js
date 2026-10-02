/** La courbe des lectures doit rester lisible sur dix ans d'historique. */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DailyActivityChart from './DailyActivityChart.vue';

/** `count` jours consécutifs à partir du 1er janvier 2020, une lecture par jour. */
const series = (count) =>
  Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2020, 0, 1 + i));
    return { date: date.toISOString().slice(0, 10), sessions: 1 };
  });

const pointsOf = (wrapper) => wrapper.findComponent({ name: 'LineChart' }).props('points');

describe('DailyActivityChart', () => {
  it('garde le grain quotidien sur les courtes périodes', () => {
    const wrapper = mount(DailyActivityChart, { props: { points: series(30) } });

    expect(pointsOf(wrapper)).toHaveLength(30);
    expect(wrapper.text()).toContain('Lectures quotidiennes');
  });

  it('regroupe par semaine au-delà de quelques mois', () => {
    // Un an de barres quotidiennes ne dessinait plus qu'un peigne illisible.
    const wrapper = mount(DailyActivityChart, { props: { points: series(365) } });

    expect(pointsOf(wrapper).length).toBeLessThan(60);
    expect(wrapper.text()).toContain('Lectures hebdomadaires');
  });

  it('regroupe par mois sur les très longues périodes', () => {
    const wrapper = mount(DailyActivityChart, { props: { points: series(1500) } });

    expect(pointsOf(wrapper).length).toBeLessThan(60);
    expect(wrapper.text()).toContain('Lectures mensuelles');
  });

  it('ne perd aucune lecture en regroupant', () => {
    const wrapper = mount(DailyActivityChart, { props: { points: series(365) } });

    const total = pointsOf(wrapper).reduce((sum, point) => sum + point.value, 0);
    expect(total).toBe(365);
  });
});
