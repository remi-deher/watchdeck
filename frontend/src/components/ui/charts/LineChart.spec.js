/** Ce que la courbe doit garantir : une échelle qui suit la fenêtre, et un zoom réel. */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import LineChart from './LineChart.vue';

const points = Array.from({ length: 10 }, (_, i) => ({
  key: `j${i}`,
  label: `J${i}`,
  fullLabel: `Jour ${i}`,
  value: i,
}));

/* Le zoom se calcule en fractions de la largeur du tracé : sans mise en page, jsdom
   renvoie une boîte de largeur nulle et toute fraction vaudrait 0. */
function stubPlotWidth(wrapper, width = 100) {
  const plot = wrapper.find('.line-chart__plot').element;
  plot.getBoundingClientRect = () => ({ left: 0, width, top: 0, height: 100, right: width, bottom: 100 });
  return plot;
}

/* Les événements sont dispatchés a la main : `trigger` fabrique un `MouseEvent` dont
   `clientX` est en lecture seule, et la position est justement ce qu'on teste ici. */
const drag = async (wrapper, fromX, toX) => {
  const plot = wrapper.find('.line-chart__plot').element;
  for (const [type, clientX] of [['pointerdown', fromX], ['pointermove', toX], ['pointerup', toX]]) {
    plot.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));
  }
  await wrapper.vm.$nextTick();
};

describe('LineChart', () => {
  it('trace un point par valeur', () => {
    const wrapper = mount(LineChart, { props: { points } });
    expect(wrapper.find('path.line').attributes('d').split('L')).toHaveLength(10);
  });

  it('restreint la fenêtre à la plage sélectionnée', async () => {
    const wrapper = mount(LineChart, { props: { points } });
    stubPlotWidth(wrapper);

    await drag(wrapper, 20, 60);

    // 20 % à 60 % de dix points : les index 2 à 5, soit quatre points.
    expect(wrapper.find('path.line').attributes('d').split('L')).toHaveLength(4);
    expect(wrapper.find('.line-chart__reset').exists()).toBe(true);
  });

  it('ne zoome pas sur un simple clic', async () => {
    const wrapper = mount(LineChart, { props: { points } });
    stubPlotWidth(wrapper);

    await drag(wrapper, 40, 40);

    expect(wrapper.find('.line-chart__reset').exists()).toBe(false);
  });

  it('rend la vue complète après réinitialisation', async () => {
    const wrapper = mount(LineChart, { props: { points } });
    stubPlotWidth(wrapper);
    await drag(wrapper, 20, 60);

    await wrapper.find('.line-chart__reset').trigger('click');

    expect(wrapper.find('path.line').attributes('d').split('L')).toHaveLength(10);
  });

  it('oublie le zoom quand les points changent', async () => {
    // Changer de période remplace le jeu de données : garder la fenêtre pointerait sur
    // des index qui ne désignent plus les mêmes dates.
    const wrapper = mount(LineChart, { props: { points } });
    stubPlotWidth(wrapper);
    await drag(wrapper, 20, 60);

    await wrapper.setProps({ points: points.slice(0, 6) });

    expect(wrapper.find('.line-chart__reset').exists()).toBe(false);
  });
});
